import { AppState } from 'react-native';
import { create } from 'zustand';
import { getDatabase } from '../db/database';
import { nasWrite, useDocumentStore } from '../stores/useDocumentStore';
import { usePrivacyStore } from '../stores/usePrivacyStore';
import { scanFile, type ScanRecord } from './scans';
import { uploadPath } from './upload';
import { DavError } from './webdav';

export const useScanRevision = create(() => ({ revision: 0, recentScanId: null as string | null }));
const changed = () => useScanRevision.setState(s => ({ revision: s.revision + 1 }));
type Job = { scanId: string; configId: string; folder: string; filename: string };
let running = false;

export async function enqueueScan(scan: ScanRecord, folder: string, configId: string) {
  uploadPath(folder, scan.name);
  if (useDocumentStore.getState().config?.id !== configId) throw new Error('Bitte wähle die NAS-Verbindung erneut.');
  const db = await getDatabase();
  const result = await db.runAsync(`INSERT INTO scan_uploads (scanId,configId,folder,filename,state)
    SELECT id,?,?,?,'waiting' FROM scans WHERE id=?
    ON CONFLICT(scanId) DO UPDATE SET configId=excluded.configId, folder=excluded.folder, filename=excluded.filename, state='waiting', error=NULL
    WHERE scan_uploads.state != 'sending'`, [configId, folder, scan.name, scan.id]);
  if (!result.changes) throw new Error('Der Scan ist gerade im Upload oder wurde entfernt.');
  changed();
  void drainScans().catch(() => {});
}

function ready() {
  const nas = useDocumentStore.getState(), privacy = usePrivacyStore.getState();
  return AppState.currentState === 'active' && privacy.initialized && !privacy.locked && nas.home && !nas.saving && !nas.uploading && nas.status !== 'syncing' ? nas.config : null;
}

export function startScanOutbox() {
  const attempt = () => { void drainScans().catch(() => {}); };
  const nas = useDocumentStore.subscribe((state, previous) => {
    if (state.home !== previous.home || state.config !== previous.config || (previous.saving && !state.saving)) attempt();
  });
  const privacy = usePrivacyStore.subscribe((state, previous) => {
    if (!state.locked && (previous.locked || state.initialized !== previous.initialized)) attempt();
  });
  const app = AppState.addEventListener('change', state => { if (state === 'active') attempt(); });
  const timer = setInterval(attempt, 60000);
  attempt();
  return () => { nas(); privacy(); app.remove(); clearInterval(timer); };
}

let recovered = false;
export async function drainScans() {
  if (running || !ready()) return;
  running = true;
  try {
    const db = await getDatabase();
    if (!recovered) {
      await db.runAsync("UPDATE scan_uploads SET state='conflict', error='Upload unterbrochen. Bitte Zielordner prüfen.' WHERE state='sending'");
      recovered = true; changed();
    }
    let config;
    while ((config = ready())) {
      const job = await db.getFirstAsync<Job>("SELECT * FROM scan_uploads WHERE state='waiting' AND configId=? ORDER BY rowid LIMIT 1", [config.id]);
      if (!job || ready()?.id !== job.configId) break;
      const claim = await db.runAsync("UPDATE scan_uploads SET state='sending' WHERE scanId=? AND configId=? AND folder=? AND filename=? AND state='waiting'", [job.scanId, job.configId, job.folder, job.filename]);
      if (!claim.changes) continue;
      changed();
      try {
        const file = scanFile(job.scanId);
        await nasWrite(job.configId, async ({ client, signal }) => {
          if (AppState.currentState !== 'active' || usePrivacyStore.getState().locked) throw new Error('Planner ist gesperrt.');
          await client.upload(job.folder, { name: job.filename, size: file.size, body: file }, signal);
        });
        await db.runAsync("UPDATE scan_uploads SET state='confirmed',error=NULL WHERE scanId=?", [job.scanId]);
        const nas = useDocumentStore.getState();
        if (nas.config?.id === job.configId && nas.path === job.folder && nas.home) await nas.browse(job.folder);
      } catch (error) {
        const retry = !(error instanceof DavError);
        await db.runAsync('UPDATE scan_uploads SET state=?, error=? WHERE scanId=?', [retry ? 'waiting' : 'conflict', error instanceof Error ? error.message : 'Upload fehlgeschlagen', job.scanId]);
        if (retry) break;
      } finally { changed(); }
    }
  } finally { running = false; }
}
