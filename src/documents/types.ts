export interface NasConfig {
  id: string;
  server: string;
  root: string;
  username: string;
  homeNetwork: string;
  autoSync: boolean;
}
export type NasInput = Omit<NasConfig, 'id'>;
export interface DavEntry {
  path: string;
  name: string;
  directory: boolean;
  size: number | null;
  modified: string | null;
  etag: string | null;
  mimeType: string;
}
export interface OfflineDocument {
  entry: DavEntry;
  fileKey: string;
  downloadedAt: string;
  missing: boolean;
}
export interface NasManifest {
  favorites: { path: string; directory: boolean; name: string }[];
  folders: Record<string, { entries: DavEntry[]; checkedAt: string }>;
  offline: Record<string, OfflineDocument>;
  lastSyncAt: string | null;
}
export const emptyManifest = (): NasManifest => ({ favorites: [], folders: {}, offline: {}, lastSyncAt: null });
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_OFFLINE_BYTES = 500 * 1024 * 1024;
export const MAX_SYNC_FILES = 200;
