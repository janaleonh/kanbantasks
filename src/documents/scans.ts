import { Directory, File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo';
import { getDatabase } from '../db/database';
import { generateUUID } from '../utils/uuid';
import { uploadPath } from './upload';

export type ScanRecord = { id: string; name: string; pages: number; size: number; createdAt: string; state?: string; error?: string; folder?: string; filename?: string; content?: string };
const pattern = /^[a-f0-9-]{36}$/i;
export function scanFile(id: string) {
  if (!pattern.test(id)) throw new Error('Ungültiger Scan.');
  return new File(Paths.document, 'PlannerScans', `${id}.pdf`);
}
export async function getScans() { return (await getDatabase()).getAllAsync<ScanRecord>('SELECT s.*,q.state,q.error,q.folder,q.filename,t.content FROM scans s LEFT JOIN scan_uploads q ON q.scanId=s.id LEFT JOIN scan_text t ON t.scanId=s.id ORDER BY s.createdAt DESC'); }
export async function scanDocument(): Promise<ScanRecord | null> {
  const scanner = requireOptionalNativeModule<{ scan: () => Promise<{ canceled: boolean; uri?: string; pages?: number; content?: string }> }>('PlannerDocumentScanner');
  if (!scanner) throw new Error('Der Dokumentenscanner benötigt einen neuen nativen iOS-Build. In Expo Go ist er nicht verfügbar.');
  const existing = await getScans();
  if (existing.length >= 30 || existing.reduce((sum, scan) => sum + scan.size, 0) >= 250 * 1024 * 1024) throw new Error('Bitte entferne bereits gesicherte lokale Scans, bevor du weitere aufnimmst.');
  const result = await scanner.scan();
  if (result.canceled) return null;
  const prefix = `${Paths.cache.uri.replace(/\/$/, '')}/PlannerScans/`;
  if (!result.uri?.startsWith(prefix) || !/^[a-f0-9-]{36}\.pdf$/i.test(result.uri.slice(prefix.length)) || !Number.isInteger(result.pages) || result.pages! < 1 || result.pages! > 20) throw new Error('Der Scanner hat keine gültige PDF geliefert.');
  const source = new File(result.uri);
  if (!source.exists || source.size > 50 * 1024 * 1024 || source.size < 5 || existing.reduce((sum, scan) => sum + scan.size, 0) + source.size > 250 * 1024 * 1024 || Paths.availableDiskSpace < source.size + 20 * 1024 * 1024) throw new Error('Die PDF ist zu groß oder es ist nicht genügend Speicher frei.');
  const reader = source.readableStream().getReader();
  try { const first = (await reader.read()).value; if (!first || new TextDecoder().decode(first.slice(0, 5)) !== '%PDF-') throw new Error('Der Scan ist keine gültige PDF.'); } finally { await reader.cancel(); }
  const id = generateUUID(), file = scanFile(id);
  const directory = new Directory(Paths.document, 'PlannerScans'); directory.create({ intermediates: true, idempotent: true });
  const record: ScanRecord = { id, name: `Scan-${new Date().toISOString().slice(0, 10)}-${id.slice(0, 8)}.pdf`, pages: result.pages!, size: source.size, createdAt: new Date().toISOString() };
  try {
    source.copy(file);
    await (await getDatabase()).runAsync('INSERT INTO scans (id,name,pages,size,createdAt) VALUES (?,?,?,?,?)', [id, record.name, record.pages, record.size, record.createdAt]);
  } catch (error) { if (file.exists) file.delete(); throw error; }
  if (typeof result.content === 'string' && result.content) {
    await (await getDatabase()).runAsync('INSERT INTO scan_text (scanId,content) VALUES (?,?)', [id, result.content.slice(0, 80000)]).catch(() => {});
  }
  try { source.delete(); } catch { /* The OS can reclaim the temporary copy. */ }
  return record;
}
export async function renameScan(id: string, name: string) {
  const filename = name.trim().toLowerCase().endsWith('.pdf') ? name.trim() : `${name.trim()}.pdf`;
  uploadPath('', filename);
  if (!name.trim()) throw new Error('Bitte gib einen Dateinamen ein.');
  await (await getDatabase()).runAsync('UPDATE scans SET name = ? WHERE id = ?', [filename, id]);
}
export async function deleteScan(id: string) {
  const file = scanFile(id);
  const db = await getDatabase();
  const deleted = await db.runAsync(`DELETE FROM scans WHERE id=? AND NOT EXISTS (SELECT 1 FROM scan_uploads WHERE scanId=? AND state='sending') AND NOT EXISTS (SELECT 1 FROM scan_tasks st JOIN tasks t ON t.id=st.taskId WHERE st.scanId=? AND t.deletedLocally=0)`, [id,id,id]);
  if (!deleted.changes) throw new Error('Der Scan ist mit einer Aufgabe verknüpft oder wird gerade hochgeladen.');
  if (file.exists) file.delete();
}
