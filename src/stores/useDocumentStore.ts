import { create } from 'zustand';
import { fetch as expoFetch } from 'expo/fetch';
import { HomeNetworkError, requireHomeNetwork } from '../documents/network';
import { isWithin, parentPath, safeSegments } from '../documents/paths';
import * as storage from '../documents/storage';
import { DavError, WebDavClient } from '../documents/webdav';
import { emptyManifest, MAX_FILE_BYTES, MAX_OFFLINE_BYTES, MAX_SYNC_FILES, type DavEntry, type NasConfig, type NasInput, type NasManifest } from '../documents/types';
import { uploadPath, validateUpload, type UploadSource } from '../documents/upload';
import { MAX_BACKUP_BYTES } from '../backup/format';

type Status = 'unconfigured' | 'waiting' | 'ready' | 'syncing' | 'error';
interface DocumentState {
  config: NasConfig | null; manifest: NasManifest; initialized: boolean; saving: boolean; uploading: boolean;
  path: string; loadingFolder: boolean; home: boolean; status: Status; error: string | null; folderError: string | null;
  progress: { done: number; total: number; name: string } | null;
  initialize: () => Promise<void>;
  saveConfig: (input: NasInput, password: string) => Promise<void>;
  disconnect: () => Promise<void>;
  browse: (path: string) => Promise<void>;
  testConnection: () => Promise<void>;
  getRemoteEntry: (path: string, expectedConfigId: string) => Promise<DavEntry>;
  uploadFile: (folder: string, source: UploadSource, expectedConfigId: string) => Promise<void>;
  uploadBackup: (source: UploadSource, expectedConfigId: string) => Promise<void>;
  listBackups: () => Promise<DavEntry[]>;
  readBackup: (path: string, expectedConfigId: string) => Promise<string>;
  toggleFavorite: (entry: DavEntry) => Promise<void>;
  syncFavorites: () => Promise<void>;
  setHome: (home: boolean) => void;
  openFile: (entry: DavEntry) => Promise<{ uri: string; release: () => void; retain: () => () => void }>;
}

let revision = 0;
let initializing: Promise<void> | null = null;
let syncRequest: Promise<void> | null = null;
const controllers = new Set<AbortController>();
const recent = new Map<string, { fileKey: string; etag: string | null; modified: string | null }>();
const message = (error: unknown) => error instanceof Error ? error.message : 'Die Dokumente konnten nicht geladen werden.';
const visible = (entry: DavEntry) => !['@eaDir', '#recycle', '.DS_Store', 'Thumbs.db'].includes(entry.name);
export const isFavoritePath = (manifest: NasManifest, entry: DavEntry) => manifest.favorites.some((favorite) => favorite.path === entry.path);
const covered = (manifest: NasManifest, path: string) => manifest.favorites.some((favorite) => favorite.directory ? isWithin(path, favorite.path) : path === favorite.path);

function cancelRequests() {
  revision++;
  controllers.forEach((controller) => controller.abort());
  controllers.clear();
  syncRequest = null;
}

interface Session { config: NasConfig; client: WebDavClient; signal: AbortSignal; assert: () => void }
async function session<T>(work: (session: Session) => Promise<T>): Promise<T> {
  const version = revision;
  const expected = useDocumentStore.getState().config;
  if (!expected) throw new Error('Bitte richte zuerst deine NAS-Verbindung in den Einstellungen ein.');
  const connection = await storage.loadConnection();
  if (!connection || connection.config.id !== expected.id || version !== revision) throw new Error('Die NAS-Verbindung hat sich geändert. Bitte versuche es erneut.');
  const controller = new AbortController();
  controllers.add(controller);
  const assert = () => { if (version !== revision || controller.signal.aborted) throw new Error('Die Dokumentenaktion wurde beendet.'); };
  const transport: typeof fetch = async (url, options) => {
    await requireHomeNetwork(connection.config); assert();
    return expoFetch(url, options);
  };
  try {
    await requireHomeNetwork(connection.config); assert();
    return await work({ config: connection.config, client: new WebDavClient(connection.config, connection.password, transport), signal: controller.signal, assert });
  } finally { controllers.delete(controller); }
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  config: null, manifest: emptyManifest(), initialized: false, saving: false, uploading: false, path: '', loadingFolder: false,
  home: false, status: 'unconfigured', error: null, folderError: null, progress: null,

  initialize: async () => {
    if (get().initialized) return;
    if (initializing) return initializing;
    const version = revision;
    initializing = (async () => {
      try {
        storage.clearTransientCopies();
        const connection = await storage.loadConnection();
        const manifest = connection ? await storage.loadManifest(connection.config.id) : emptyManifest();
        if (version === revision) set({ config: connection?.config || null, manifest, initialized: true, status: connection ? 'waiting' : 'unconfigured' });
      } catch (error) { if (version === revision) set({ initialized: true, error: message(error), status: 'error' }); }
    })().finally(() => { initializing = null; });
    return initializing;
  },

  saveConfig: async (input, password) => {
    if (get().saving) return;
    cancelRequests(); const version = revision;
    set({ saving: true, uploading: false, loadingFolder: false, progress: null });
    try {
      const config = await storage.saveConnection(input, password);
      const manifest = config.id === get().config?.id ? get().manifest : await storage.loadManifest(config.id);
      if (version !== revision) return;
      set({ config, manifest, path: '', initialized: true, status: 'waiting', error: null, folderError: null });
    } finally { if (version === revision) set({ saving: false }); }
  },

  disconnect: async () => {
    if (get().saving) throw new Error('Bitte warte, bis die Verbindung gespeichert wurde.');
    cancelRequests();
    set({ config: null, manifest: emptyManifest(), path: '', status: 'unconfigured', error: null, folderError: null, progress: null, loadingFolder: false, uploading: false });
    recent.clear();
    await storage.clearNasStorage();
  },

  browse: async (path) => {
    const normalized = safeSegments(path).join('/');
    const version = revision;
    set({ path: normalized, loadingFolder: true, folderError: null });
    try {
      await session(async ({ client, signal, config, assert }) => {
        const entries = (await client.list(normalized, signal)).filter(visible);
        assert();
        const manifest = { ...get().manifest, folders: { ...get().manifest.folders, [normalized]: { entries, checkedAt: new Date().toISOString() } } };
        set({ manifest });
        await storage.saveManifest(config.id, manifest);
      });
    } catch (error) { if (version === revision && get().path === normalized) set({ folderError: message(error) }); }
    finally { if (version === revision && get().path === normalized) set({ loadingFolder: false }); }
  },

  testConnection: async () => {
    await session(async ({ client, signal, assert }) => { await client.list('', signal); assert(); });
    set({ status: 'ready', error: null });
  },
  getRemoteEntry: async (path, expectedConfigId) => session(async ({ client, config, signal, assert }) => { if (config.id !== expectedConfigId) throw new Error('Die NAS-Verbindung wurde geändert. Bitte öffne die Aufgabe erneut.'); const entry = await client.stat(safeSegments(path).join('/'), signal); assert(); return entry; }),

  uploadFile: async (folder, source, expectedConfigId) => {
    if (get().uploading || get().saving || syncRequest) throw new Error('Bitte warte, bis die laufende Dokumentenaktion beendet ist.');
    if (get().config?.id !== expectedConfigId) throw new Error('Die NAS-Verbindung wurde geändert. Bitte wähle die Datei erneut aus.');
    validateUpload(source);
    const target = uploadPath(folder, source.name);
    const normalized = parentPath(target);
    const version = revision;
    let confirmed = false;
    set({ uploading: true });
    try {
      await session(async ({ client, signal, assert }) => {
        await client.upload(normalized, source, signal);
        confirmed = true;
        // A successful write is not retried if the subsequent folder refresh fails.
        assert();
        if (get().path === normalized) await get().browse(normalized);
        else {
          const folders = { ...get().manifest.folders }; delete folders[normalized];
          const manifest = { ...get().manifest, folders };
          set({ manifest }); await storage.saveManifest(expectedConfigId, manifest);
        }
      });
    } catch (error) {
      if (confirmed) throw new Error('Das NAS hat die Datei gespeichert. Die Ordneranzeige konnte danach nicht aktualisiert werden. Bitte öffne den Zielordner erneut.');
      throw error;
    } finally { if (version === revision) set({ uploading: false }); }
  },

  uploadBackup: async (source, expectedConfigId) => {
    if (get().uploading || get().saving || syncRequest) throw new Error('Bitte warte, bis die laufende NAS-Aktion beendet ist.');
    if (get().config?.id !== expectedConfigId) throw new Error('Die NAS-Verbindung wurde geändert.');
    validateUpload(source);
    if (source.size > MAX_BACKUP_BYTES || !/^Planner-backup-[a-z0-9-]+\.json$/i.test(source.name)) throw new Error('Die Sicherungsdatei ist ungültig oder zu groß.');
    const version = revision;
    set({ uploading: true });
    try {
      await session(async ({ client, config, signal, assert }) => {
        if (config.id !== expectedConfigId) throw new Error('Die NAS-Verbindung wurde geändert.');
        await client.ensureDirectory('Planner-Backups', signal); assert();
        await client.upload('Planner-Backups', source, signal); assert();
      });
    } finally { if (version === revision) set({ uploading: false }); }
  },
  listBackups: async () => session(async ({ client, signal, assert }) => {
    try {
      const entries = await client.list('Planner-Backups', signal); assert();
      return entries.filter(entry => !entry.directory && /^Planner-backup-[a-z0-9-]+\.json$/i.test(entry.name)).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 200);
    } catch (error) { if (error instanceof DavError && error.status === 404) return []; throw error; }
  }),
  readBackup: async (path, expectedConfigId) => session(async ({ client, config, signal, assert }) => {
    if (config.id !== expectedConfigId || !/^Planner-Backups\/Planner-backup-[a-z0-9-]+\.json$/i.test(path)) throw new Error('Ungültige Sicherungsdatei oder geänderte NAS-Verbindung.');
    const entry = await client.stat(path, signal); assert();
    let text = '';
    const decoder = new TextDecoder();
    await client.download(entry, new WritableStream<Uint8Array>({ write: chunk => { text += decoder.decode(chunk, { stream: true }); } }), signal, MAX_BACKUP_BYTES);
    assert(); return text + decoder.decode();
  }),

  toggleFavorite: async (entry) => {
    const config = get().config;
    if (!config || get().saving || get().uploading) return;
    cancelRequests(); const version = revision;
    const old = get().manifest;
    const favorites = isFavoritePath(old, entry) ? old.favorites.filter((favorite) => favorite.path !== entry.path) : [...old.favorites, { path: entry.path, name: entry.name, directory: entry.directory }];
    const manifest = { ...old, favorites, offline: { ...old.offline } };
    const removed = Object.entries(manifest.offline).filter(([path]) => !covered(manifest, path));
    removed.forEach(([path]) => { delete manifest.offline[path]; });
    set({ manifest, status: 'waiting', progress: null, error: null, loadingFolder: false });
    try {
      await storage.saveManifest(config.id, manifest);
      for (const [, record] of removed) storage.removeCachedFile(config.id, record.fileKey);
      if (version === revision && get().home) void get().syncFavorites();
    } catch (error) { if (version === revision) set({ error: message(error), status: 'error' }); }
  },

  syncFavorites: async () => {
    if (syncRequest) return syncRequest;
    if (!get().config || !get().manifest.favorites.length || get().saving || get().uploading) return;
    const version = revision;
    syncRequest = (async () => {
      set({ status: 'syncing', error: null, progress: { done: 0, total: 0, name: 'Ordner prüfen …' } });
      try {
        await session(async ({ config, client, signal, assert }) => {
          const errors: string[] = [];
          const files = new Map<string, DavEntry>();
          const visited = new Map<string, DavEntry[]>();
          const queue = get().manifest.favorites.filter((favorite) => favorite.directory).map((favorite) => favorite.path);
          const missingFolders: string[] = [];
          const missingFiles: string[] = [];
          for (const favorite of get().manifest.favorites.filter((favorite) => !favorite.directory)) {
            assert();
            try { const entry = await client.stat(favorite.path, signal); if (!entry.directory) files.set(entry.path, entry); }
            catch (error) { if (error instanceof HomeNetworkError || signal.aborted) throw error; if (error instanceof DavError && error.status === 404) missingFiles.push(favorite.path); errors.push(`${favorite.name}: ${message(error)}`); }
          }
          while (queue.length) {
            assert();
            const folder = queue.shift()!;
            if (visited.has(folder)) continue;
            if (visited.size >= 100) { errors.push('Es werden höchstens 100 Ordner pro Abgleich durchsucht. Bitte wähle kleinere Ordner.'); break; }
            try {
              const entries = (await client.list(folder, signal)).filter(visible);
              assert(); visited.set(folder, entries);
              for (const entry of entries) {
                if (entry.directory) queue.push(entry.path);
                else files.set(entry.path, entry);
              }
              if (files.size > MAX_SYNC_FILES) { errors.push('Pro Abgleich werden höchstens 200 Dateien geladen. Bitte wähle kleinere Ordner.'); break; }
            } catch (error) {
              if (error instanceof HomeNetworkError || signal.aborted) throw error;
              if (error instanceof DavError && error.status === 404) missingFolders.push(folder);
              errors.push(`${folder || 'Startordner'}: ${message(error)}`);
            }
          }
          assert();
          let manifest = { ...get().manifest, folders: { ...get().manifest.folders }, offline: { ...get().manifest.offline } };
          for (const [path, entries] of visited) manifest.folders[path] = { entries, checkedAt: new Date().toISOString() };
          for (const [path, record] of Object.entries(manifest.offline)) {
            if (missingFiles.includes(path) || (visited.has(parentPath(path)) && !files.has(path)) || missingFolders.some((folder) => isWithin(path, folder))) manifest.offline[path] = { ...record, missing: true };
          }
          set({ manifest }); await storage.saveManifest(config.id, manifest);
          const entries = [...files.values()].slice(0, MAX_SYNC_FILES);
          if (files.size > MAX_SYNC_FILES && !errors.some((error) => error.includes('200 Dateien'))) errors.push('Es wurden mehr als 200 Dateien gefunden. Bitte wähle kleinere Offline-Ordner.');
          for (const [index, entry] of entries.entries()) {
            assert();
            set({ progress: { done: index, total: entries.length, name: entry.name } });
            let downloaded: Awaited<ReturnType<typeof storage.downloadCopy>> | null = null;
            const previous = get().manifest.offline[entry.path];
            try {
              const exists = previous && storage.cachedFile(config.id, previous.fileKey).exists;
              const same = previous && (entry.etag ? entry.etag === previous.entry.etag : !!entry.modified && entry.size !== null && entry.modified === previous.entry.modified && entry.size === previous.entry.size);
              if (exists && same && !previous.missing) continue;
              const used = Object.values(get().manifest.offline).reduce((sum, record) => sum + (record.entry.size || 0), 0) - (previous?.entry.size || 0);
              const limit = Math.min(MAX_FILE_BYTES, MAX_OFFLINE_BYTES - used);
              if (limit <= 0 || (entry.size !== null && entry.size > limit)) throw new Error('Offline-Limit erreicht (50 MB pro Datei, 500 MB insgesamt).');
              downloaded = await storage.downloadCopy(client, config, entry, signal, true, limit);
              assert();
              manifest = { ...get().manifest, offline: { ...get().manifest.offline, [entry.path]: { entry: downloaded.entry, fileKey: downloaded.fileKey, downloadedAt: new Date().toISOString(), missing: false } } };
              set({ manifest });
              await storage.saveManifest(config.id, manifest);
              assert();
              if (previous) { try { storage.removeCachedFile(config.id, previous.fileKey); } catch { /* Keep an unused old version if cleanup fails. */ } }
              downloaded = null;
            } catch (error) {
              if (downloaded) {
                if (version === revision && get().manifest.offline[entry.path]?.fileKey === downloaded.fileKey) {
                  const offline = { ...get().manifest.offline };
                  delete offline[entry.path];
                  // The old copy remains on disk if its replacement could not be committed.
                  if (previous) offline[entry.path] = previous;
                  set({ manifest: { ...get().manifest, offline } });
                  await storage.saveManifest(config.id, get().manifest).catch(() => {});
                }
                storage.removeCachedFile(config.id, downloaded.fileKey);
              }
              if (signal.aborted || version !== revision || error instanceof HomeNetworkError) throw error;
              errors.push(`${entry.name}: ${message(error)}`);
            }
          }
          assert();
          manifest = { ...get().manifest, lastSyncAt: errors.length ? get().manifest.lastSyncAt : new Date().toISOString() };
          set({ manifest });
          await storage.saveManifest(config.id, manifest);
          assert();
          set({ status: errors.length ? 'error' : 'ready', error: errors.length ? `${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n… und ${errors.length - 3} weitere Hinweise.` : ''}` : null, progress: null });
        });
      } catch (error) { if (version === revision) set({ status: error instanceof HomeNetworkError ? 'waiting' : 'error', error: message(error), progress: null }); }
    })().finally(() => { if (version === revision) syncRequest = null; });
    return syncRequest;
  },

  setHome: (home) => {
    if (!home && get().home && !get().saving) { cancelRequests(); set({ status: get().config ? 'waiting' : 'unconfigured', uploading: false, loadingFolder: false, progress: null, error: null }); }
    set({ home });
  },

  openFile: async (entry) => {
    const config = get().config;
    if (!config || entry.directory) throw new Error('Bitte wähle eine Datei aus.');
    const offline = get().manifest.offline[entry.path];
    if (offline && storage.cachedFile(config.id, offline.fileKey).exists) return storage.leaseCachedFile(config.id, offline.fileKey);
    const key = `${config.id}:${entry.path}`;
    const cached = recent.get(key);
    if (cached && cached.etag === entry.etag && cached.modified === entry.modified && storage.cachedFile(config.id, cached.fileKey, false).exists) return storage.leaseCachedFile(config.id, cached.fileKey, false);
    return session(async ({ client, signal, assert }) => {
      const downloaded = await storage.downloadCopy(client, config, entry, signal, false);
      try { assert(); } catch (error) { storage.removeCachedFile(config.id, downloaded.fileKey, false); throw error; }
      recent.set(key, { fileKey: downloaded.fileKey, etag: downloaded.entry.etag, modified: entry.modified });
      if (cached) { try { storage.removeCachedFile(config.id, cached.fileKey, false); } catch { /* The new copy remains usable if cleanup fails. */ } }
      return storage.leaseCachedFile(config.id, downloaded.fileKey, false);
    });
  },
}));
