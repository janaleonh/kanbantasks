import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { getDatabase, getSetting, setSetting } from '../db/database';
import { normalizeInput } from './paths';
import { emptyManifest, MAX_FILE_BYTES, type DavEntry, type NasConfig, type NasInput, type NasManifest } from './types';
import type { WebDavClient } from './webdav';

const CREDENTIALS = 'planner_nas_credentials';
const SPACE = 'planner-nas';
let writes: Promise<void> = Promise.resolve();
const leases = new Map<string, number>();
const pendingDeletes = new Map<string, () => void>();

export async function loadConnection(): Promise<{ config: NasConfig; password: string } | null> {
  const saved = await SecureStore.getItemAsync(CREDENTIALS);
  if (!saved) return null;
  const parsed = JSON.parse(saved);
  if (!/^[a-f0-9]{64}$/.test(parsed.config?.id) || typeof parsed.password !== 'string') throw new Error('Die NAS-Einstellungen sind ungültig. Bitte richte die Verbindung erneut ein.');
  return { config: { id: parsed.config.id, ...normalizeInput(parsed.config) }, password: parsed.password };
}

export async function saveConnection(input: NasInput, password: string): Promise<NasConfig> {
  const normalized = normalizeInput(input);
  const id = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify([normalized.server, normalized.root, normalized.username]));
  const previous = await loadConnection().catch(() => null);
  const secret = password || (previous?.config.id === id ? previous.password : '');
  if (!secret) throw new Error('Bitte gib das Passwort für diesen NAS-Benutzer ein.');
  const config = { ...normalized, id };
  await SecureStore.setItemAsync(CREDENTIALS, JSON.stringify({ config, password: secret }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return config;
}

export async function loadManifest(id: string): Promise<NasManifest> {
  try {
    const parsed = JSON.parse(await getSetting(`nasManifest:${id}`, 'null'));
    if (parsed && Array.isArray(parsed.favorites) && parsed.folders && parsed.offline) return parsed;
  } catch { /* A damaged cache index must not prevent opening the app. */ }
  return emptyManifest();
}

export function saveManifest(id: string, manifest: NasManifest) {
  const snapshot = JSON.stringify(manifest);
  writes = writes.catch(() => {}).then(() => setSetting(`nasManifest:${id}`, snapshot));
  return writes;
}

function directory(id: string, offline: boolean) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Ungültiger Dokumentenspeicher.');
  return new Directory(offline ? Paths.document : Paths.cache, SPACE, id);
}

export function cachedFile(id: string, fileKey: string, offline = true) {
  const parts = fileKey.split('/');
  if (parts.length !== 2 || !/^[a-f0-9-]{36}$/.test(parts[0]) || !parts[1] || parts[1] === '.' || parts[1] === '..' || /[\\%#?:<>|*\u0000-\u001F]/.test(parts[1])) throw new Error('Ungültiger lokaler Dokumentenpfad.');
  return new File(directory(id, offline), parts[0], parts[1]);
}

export function removeCachedFile(id: string, fileKey: string, offline = true) {
  const file = cachedFile(id, fileKey, offline);
  const folder = file.parentDirectory;
  const key = `${id}:${offline}:${fileKey}`;
  const remove = () => { if (folder.exists) folder.delete(); };
  if (leases.get(key)) pendingDeletes.set(key, remove);
  else remove();
}

export function leaseCachedFile(id: string, fileKey: string, offline = true): { uri: string; release: () => void; retain: () => () => void } {
  const file = cachedFile(id, fileKey, offline);
  if (!file.exists) throw new Error('Diese Offlinekopie ist nicht mehr auf dem Gerät. Bitte lade sie zu Hause erneut.');
  const key = `${id}:${offline}:${fileKey}`;
  leases.set(key, (leases.get(key) || 0) + 1);
  let released = false;
  return { uri: file.uri, retain: () => leaseCachedFile(id, fileKey, offline).release, release: () => {
    if (released) return;
    released = true;
    const remaining = (leases.get(key) || 1) - 1;
    if (remaining) leases.set(key, remaining);
    else {
      leases.delete(key);
      const remove = pendingDeletes.get(key);
      pendingDeletes.delete(key);
      try { remove?.(); } catch { /* A later storage cleanup can remove unused versions. */ }
    }
  } };
}

export async function downloadCopy(client: WebDavClient, config: NasConfig, entry: DavEntry, signal: AbortSignal, offline: boolean, limit = MAX_FILE_BYTES) {
  if (Paths.availableDiskSpace < (entry.size ?? MAX_FILE_BYTES) + 20 * 1024 * 1024) throw new Error('Auf dem iPhone ist nicht genügend freier Speicher für diese Datei.');
  const folder = new Directory(directory(config.id, offline), Crypto.randomUUID());
  folder.create({ intermediates: true, idempotent: true });
  const safeName = entry.name.replace(/[\\/:%#\u0000-\u001F<>|?*]/g, '_').slice(-180).replace(/^\.+$/, '_') || 'Dokument';
  const file = new File(folder, safeName);
  const fileKey = `${folder.name}/${safeName}`;
  try {
    file.create();
    const metadata = await client.download(entry, file.writableStream(), signal, limit);
    if (signal.aborted) throw new Error('Der Download wurde beendet.');
    return { fileKey, uri: file.uri, entry: { ...entry, ...metadata } };
  } catch (error) { if (folder.exists) folder.delete(); throw error; }
}

export async function clearNasStorage() {
  await SecureStore.deleteItemAsync(CREDENTIALS);
  await writes.catch(() => {});
  for (const base of [Paths.document, Paths.cache]) {
    const folder = new Directory(base, SPACE);
    if (folder.exists) folder.delete();
  }
  const db = await getDatabase();
  await db.runAsync("DELETE FROM sync_meta WHERE key LIKE 'nasManifest:%'");
}

export function clearTransientCopies() {
  const folder = new Directory(Paths.cache, SPACE);
  if (folder.exists) folder.delete();
}
