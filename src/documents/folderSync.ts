import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { getSetting, setSetting } from '../db/database';
import { nasWrite, useDocumentStore } from '../stores/useDocumentStore';
import { usePrivacyStore } from '../stores/usePrivacyStore';
import { uploadPath } from './upload';
import { DavError } from './webdav';
import { parentPath } from './paths';
import { generateUUID } from '../utils/uuid';

type Link = { bookmark: string; folder: string; id: string };
type Receipt = { hash: string; etag: string | null };
type Access = { remember(uri: string): Promise<string>; entries(b: string): Promise<{path:string; kind:string}[]>; snapshot(b:string,path:string):Promise<string> };
function access() {
  const module = requireOptionalNativeModule<Access>('PlannerFolderAccess');
  if (!module) throw new Error('Der dauerhafte Ordnerzugriff benötigt einen neuen iOS-Build.');
  return module;
}
export const useFolderStatus = create(() => ({ message: '', busy: false }));
const setting = (id: string) => 'iphone-folder:' + id;
export async function linkFolder(id: string, destination: string) {
  const module = access();
  const picked = await Directory.pickDirectoryAsync();
  const link: Link = { bookmark: await module.remember(picked.uri), folder: uploadPath(destination, picked.name), id: generateUUID() };
  if (useDocumentStore.getState().config?.id !== id) throw new Error('NAS-Verbindung geändert.');
  await setSetting(setting(id), JSON.stringify(link));
  useFolderStatus.setState({ message: 'Zielordner: /' + link.folder });
}
export async function unlinkFolder(id: string) {
  await setSetting(setting(id), '');
  useFolderStatus.setState({ message: 'Ordnerabgleich ausgeschaltet.' });
}
export async function syncFolder() {
  const id = useDocumentStore.getState().config?.id;
  if (!id || useFolderStatus.getState().busy) return;
  useFolderStatus.setState({ busy: true });
  try {
    const saved = await getSetting(setting(id), '');
    if (!saved) return;
    const link: Link = JSON.parse(saved);
    const module = access();
    const active = () => {
      const privacy = usePrivacyStore.getState();
      if (AppState.currentState !== 'active' || !privacy.initialized || privacy.locked) throw new Error('Abgleich beim nächsten Öffnen fortsetzen.');
    };
    active();
    const entries = await module.entries(link.bookmark);
    let copied = 0;
    const conflicts: string[] = [];
    await nasWrite(id, async ({ client, signal, assert }) => {
      await client.ensureDirectory(link.folder, signal);
      for (const entry of entries) {
        active(); assert();
        const target = entry.path.split('/').reduce(uploadPath, link.folder);
        if (entry.kind === 'directory') { await client.ensureDirectory(target, signal); continue; }
        const receiptKey = 'folder-file:' + link.id + ':' + entry.path;
        let previous: Receipt | null = JSON.parse(await getSetting(receiptKey, 'null'));
        if (previous) {
          try {
            const remote = await client.stat(target, signal);
            if (remote.directory || remote.etag !== previous.etag) {
              conflicts.push(entry.path);
              continue;
            }
          } catch (error) {
            if (!(error instanceof DavError && error.status === 404)) throw error;
            previous = null;
          }
        }
        const file = new File(await module.snapshot(link.bookmark, entry.path));
        try {
          const hash = file.md5;
          if (!hash) throw new Error('Datei nicht lesbar: ' + entry.path);
          if (previous?.hash === hash) continue;
          if (previous && (!previous.etag || previous.etag.startsWith('W/'))) { conflicts.push(entry.path); continue; }
          active(); assert();
          try { await client.upload(parentPath(target), { name: target.split('/').pop()!, size: file.size, body: file }, signal, previous?.etag || undefined); }
          catch (err) { if (!(err instanceof DavError && err.status === 412)) throw err; }
          const remote = await client.stat(target, signal);
          const check = new File(Paths.cache, 'PlannerVerify-' + generateUUID());
          try {
            check.create();
            const version = await client.download(remote, check.writableStream(), signal);
            if (check.md5 !== hash) { conflicts.push(entry.path); continue; }
            await setSetting(receiptKey, JSON.stringify({ hash, etag: version.etag }));
            copied++;
          } finally { if (check.exists) check.delete(); }
        } finally { if (file.exists) file.delete(); }
      }
    });
    useFolderStatus.setState({ message: new Date().toLocaleTimeString('de-DE') + ' · ' + copied + ' Dateien bestätigt.' + (conflicts.length ? ' Konflikte: ' + conflicts.slice(0, 3).join(', ') : '') });
  } catch (error) { useFolderStatus.setState({ message: error instanceof Error ? error.message : 'Ordnerabgleich fehlgeschlagen.' }); }
  finally { useFolderStatus.setState({ busy: false }); }
}
export function startFolderSync() {
  const attempt = () => {
    const doc = useDocumentStore.getState(), privacy = usePrivacyStore.getState();
    if (doc.home && !doc.uploading && !doc.saving && doc.status !== 'syncing' && privacy.initialized && !privacy.locked && AppState.currentState === 'active') void syncFolder();
  };
  const home = useDocumentStore.subscribe((s,p) => { if (s.home !== p.home || s.config?.id !== p.config?.id) attempt(); });
  const unlock = usePrivacyStore.subscribe((s,p) => { if (s.locked !== p.locked || s.initialized !== p.initialized) attempt(); });
  const foreground = AppState.addEventListener('change', phase => { if (phase === 'active') attempt(); });
  const timer = setInterval(attempt, 300000); attempt();
  return () => { home(); unlock(); foreground.remove(); clearInterval(timer); };
}
