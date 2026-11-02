import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { getSetting, setSetting } from '../db/database';
import { collectBackup, restoreBackup } from '../backup/database';
import { decodeBackup, MAX_BACKUP_BYTES, type BackupData } from '../backup/format';
import { useDocumentStore } from './useDocumentStore';
import { useKanbanStore } from './useKanbanStore';
import type { DavEntry } from '../documents/types';

type BackupState = {
  initialized: boolean; automatic: boolean; busy: boolean; lastAt: string | null; error: string | null; files: DavEntry[];
  initialize: () => Promise<void>; setAutomatic: (enabled: boolean) => Promise<void>;
  createBackup: () => Promise<void>; refreshFiles: () => Promise<void>; read: (path: string) => Promise<BackupData>;
  parse: (text: string) => Promise<BackupData>; restore: (data: BackupData) => Promise<void>;
};
let init: Promise<void> | null = null;
const digest = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
export const useBackupStore = create<BackupState>((set, get) => ({
  initialized: false, automatic: true, busy: false, lastAt: null, error: null, files: [],
  initialize: async () => {
    if (get().initialized) return;
    if (init) return init;
    init = getSetting('nasAutomaticBackup', 'true').then(value => set({ automatic: value === 'true', initialized: true })).finally(() => { init = null; });
    return init;
  },
  setAutomatic: async enabled => { await setSetting('nasAutomaticBackup', String(enabled)); set({ automatic: enabled }); },
  createBackup: async () => {
    if (get().busy) throw new Error('Eine Sicherungsaktion läuft bereits.');
    const doc = useDocumentStore.getState(), configId = doc.config?.id;
    if (!configId) throw new Error('Bitte richte zuerst dein NAS ein.');
    set({ busy: true, error: null });
    try {
      const data = await collectBackup();
      const payload = JSON.stringify(data), checksum = await digest(payload);
      const text = JSON.stringify({ format: 'planner-backup', version: 1, checksum, data });
      const body = new Blob([text], { type: 'application/json' });
      if (body.size > MAX_BACKUP_BYTES) throw new Error('Die Aufgaben-Sicherung überschreitet 10 MB.');
      const name = `Planner-backup-${new Date().toISOString().replace(/[^0-9TZ]/g, '-')}-${Crypto.randomUUID()}.json`;
      await doc.uploadBackup({ name, size: body.size, body }, configId);
      const readBack = await doc.readBackup(`Planner-Backups/${name}`, configId);
      const verified = decodeBackup(readBack);
      if (verified.checksum !== checksum || await digest(verified.payload) !== checksum) throw new Error('Die Sicherung konnte nach dem Hochladen nicht bestätigt werden. Die Datei bleibt auf dem NAS zur Prüfung erhalten.');
      const lastAt = new Date().toISOString();
      await setSetting(`nasBackupAt:${configId}`, lastAt); set({ lastAt });
    } catch (error) { set({ error: error instanceof Error ? error.message : 'Die Sicherung ist fehlgeschlagen.' }); throw error; }
    finally { set({ busy: false }); }
  },
  refreshFiles: async () => {
    const configId = useDocumentStore.getState().config?.id;
    const files = await useDocumentStore.getState().listBackups();
    if (useDocumentStore.getState().config?.id === configId) set({ files, lastAt: configId ? await getSetting(`nasBackupAt:${configId}`, '') || null : null });
  },
  parse: async text => {
    const { data, payload, checksum } = decodeBackup(text);
    if (await digest(payload) !== checksum) throw new Error('Die Prüfsumme stimmt nicht. Diese Sicherung ist beschädigt oder wurde verändert.');
    return data;
  },
  read: async path => {
    const config = useDocumentStore.getState().config;
    if (!config) throw new Error('Bitte verbinde zuerst dein NAS.');
    return get().parse(await useDocumentStore.getState().readBackup(path, config.id));
  },
  restore: async data => {
    if (get().busy) throw new Error('Eine Sicherungsaktion läuft bereits.');
    set({ busy: true, error: null });
    try { await restoreBackup(data); await useKanbanStore.getState().loadAll(); useKanbanStore.getState().scheduleSync(); }
    finally { set({ busy: false }); }
  },
}));
