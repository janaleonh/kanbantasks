import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Base64 } from 'js-base64';
import { parentPath, relativeHref, remoteUrl } from './paths';
import { MAX_FILE_BYTES, type DavEntry, type NasConfig } from './types';
import { uploadPath, validateUpload, type UploadSource } from './upload';

const PROPERTIES = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:getcontentlength/><d:getcontenttype/><d:getetag/><d:getlastmodified/></d:prop></d:propfind>';
const array = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const decodeText = (value: unknown) => String(value ?? '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, number: string) => {
  const code = number.toLowerCase().startsWith('x') ? parseInt(number.slice(1), 16) : Number(number);
  return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}).replace(/&(amp|lt|gt|quot|apos);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]!);

export class DavError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export function parseMultiStatus(xml: string, config: Pick<NasConfig, 'server' | 'root'>, path: string, includeSelf = false): DavEntry[] {
  if (xml.length > 4 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new DavError('Die WebDAV-Antwort ist ungültig oder der Ordner ist zu groß.');
  const data = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false, processEntities: false }).parse(xml);
  if (!data || typeof data !== 'object' || !Object.prototype.hasOwnProperty.call(data, 'multistatus')) throw new DavError('Die Adresse liefert keine WebDAV-Ordnerliste. Prüfe den WebDAV-Port und Startordner.');
  const result = new Map<string, DavEntry>();
  for (const response of array<any>(data.multistatus?.response)) {
    const relative = relativeHref(decodeText(response.href), config, path);
    if (relative === null || (relative === path ? !includeSelf : parentPath(relative) !== path)) continue;
    const successes = array<any>(response.propstat).filter((stat) => /\s200(?:\s|$)/.test(String(stat.status)));
    if (!successes.length) continue;
    const properties = Object.assign({}, ...successes.map((stat) => stat.prop || {}));
    const directory = properties.resourcetype && typeof properties.resourcetype === 'object' && 'collection' in properties.resourcetype;
    const size = properties.getcontentlength !== undefined && /^\d+$/.test(String(properties.getcontentlength)) ? Number(properties.getcontentlength) : null;
    const modified = properties.getlastmodified ? new Date(decodeText(properties.getlastmodified)) : null;
    result.set(relative, {
      path: relative, name: relative.split('/').at(-1) || 'Dokumente', directory: !!directory,
      size: size !== null && Number.isSafeInteger(size) ? size : null,
      modified: modified && Number.isFinite(modified.getTime()) ? modified.toISOString() : null,
      etag: properties.getetag ? decodeText(properties.getetag) : null,
      mimeType: decodeText(properties.getcontenttype).split(';')[0].trim() || 'application/octet-stream',
    });
  }
  return [...result.values()].sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, 'de', { numeric: true }));
}

export class WebDavClient {
  constructor(private config: NasConfig, private password: string, private transport: typeof fetch) {}

  private async withResponse<T>(path: string, options: RequestInit, signal: AbortSignal, consume: (response: Response) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) abort();
    signal.addEventListener('abort', abort);
    const timeout = setTimeout(abort, options.method === 'PROPFIND' ? 20000 : 120000);
    try {
      const response = await this.transport(remoteUrl(this.config, path, options.method === 'PROPFIND' || options.method === 'MKCOL'), {
        ...options, redirect: 'error', credentials: 'omit', signal: controller.signal,
        headers: { Authorization: `Basic ${Base64.encode(`${this.config.username}:${this.password}`)}`, ...options.headers },
      });
      if (response.redirected || (response.status >= 300 && response.status < 400)) throw new DavError('WebDAV-Weiterleitungen werden nicht verwendet. Bitte trage die direkte NAS-Adresse ein.');
      if (!response.ok) {
        if (response.status === 401) throw new DavError('Benutzername oder Passwort wurde vom NAS abgelehnt.', 401);
        if (response.status === 403) throw new DavError(options.method === 'PUT' ? 'Dieser NAS-Benutzer darf in diesen Ordner keine Dateien hochladen. Prüfe seine Schreibrechte.' : 'Dieser NAS-Benutzer hat keinen Lesezugriff auf den Ordner.', 403);
        if (response.status === 404) throw new DavError('Die Datei oder der Ordner ist auf dem NAS nicht mehr vorhanden.', 404);
        if (response.status === 412) throw new DavError(options.method === 'PUT' ? 'Eine Datei mit diesem Namen existiert bereits. Sie wurde nicht überschrieben. Benenne deine Datei um.' : 'Die Datei wurde während des Abgleichs geändert. Bitte synchronisiere erneut.', 412);
        if (response.status === 409 && options.method === 'PUT') throw new DavError('Der Zielordner ist nicht vorhanden. Bitte öffne den Ordner erneut.', 409);
        if (response.status === 507) throw new DavError('Auf dem NAS ist nicht genügend Speicher verfügbar.', 507);
        throw new DavError(`Das NAS meldet einen WebDAV-Fehler (${response.status}).`, response.status);
      }
      if (options.method === 'PROPFIND' && response.status !== 207) throw new DavError('Die Adresse liefert keine WebDAV-Antwort. Bitte verwende den WebDAV-Port, normalerweise 5006.');
      return await consume(response);
    } catch (error) {
      if (error instanceof DavError) throw error;
      if (options.method === 'PUT') throw new DavError('Der Upload wurde nicht bestätigt. Prüfe zu Hause den Zielordner: Die Datei kann bereits ganz oder teilweise angekommen sein. Es wird nicht automatisch erneut hochgeladen.');
      if (signal.aborted) throw new DavError('Der Abgleich wurde beendet.');
      throw new DavError('NAS nicht erreichbar. Prüfe Heim-WLAN, NAS-Adresse, das gültige HTTPS-Zertifikat und die iPhone-Berechtigung für das lokale Netzwerk.');
    } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
  }

  async list(path: string, signal: AbortSignal, depth: '0' | '1' = '1') {
    return this.withResponse(path, { method: 'PROPFIND', headers: { Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' }, body: PROPERTIES }, signal,
      async (response) => parseMultiStatus(await response.text(), this.config, path, depth === '0'));
  }

  async stat(path: string, signal: AbortSignal) {
    const entries = path ? await this.list(parentPath(path), signal) : await this.list('', signal, '0');
    const entry = entries.find((entry) => entry.path === path);
    if (!entry) throw new DavError('Die Datei oder der Ordner konnte nicht gelesen werden.', 404);
    return entry;
  }

  async ensureDirectory(path: string, signal: AbortSignal) {
    try { await this.withResponse(path, { method: 'MKCOL' }, signal, async response => { if (response.status !== 201) throw new DavError('Der Sicherungsordner konnte nicht angelegt werden.'); await response.body?.cancel(); }); }
    catch (error) {
      if (!(error instanceof DavError) || error.status !== 405) throw error;
      const existing = await this.stat(path, signal);
      if (!existing.directory) throw new DavError('Der Sicherungsordner ist durch eine gleichnamige Datei blockiert.');
    }
  }

  async upload(folder: string, source: UploadSource, signal: AbortSignal) {
    validateUpload(source);
    const path = uploadPath(folder, source.name);
    if (signal.aborted) throw new DavError('Der Upload wurde beendet.');
    await this.withResponse(path, {
      method: 'PUT', body: source.body,
      headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' },
    }, signal, async (response) => {
      if (response.status !== 201) throw new DavError('Das NAS hat die Neuanlage nicht eindeutig bestätigt. Bitte prüfe den Zielordner vor einem weiteren Upload.');
      await response.body?.cancel();
    });
    return path;
  }

  async download(entry: DavEntry, destination: WritableStream<Uint8Array>, signal: AbortSignal, limit = MAX_FILE_BYTES) {
    const writer = destination.getWriter();
    try {
      return await this.withResponse(entry.path, { method: 'GET', headers: { 'Accept-Encoding': 'identity', ...(entry.etag && !entry.etag.startsWith('W/') ? { 'If-Match': entry.etag } : {}) } }, signal, async (response) => {
        if (entry.directory || (entry.size !== null && entry.size > limit) || Number(response.headers.get('content-length') || 0) > limit) throw new DavError('Diese Datei überschreitet das Offline-Limit von 50 MB.');
        if (!response.body) throw new DavError('Die Datei konnte nicht heruntergeladen werden.');
        const reader = response.body.getReader();
        let bytes = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            if (signal.aborted) throw new DavError('Der Download wurde beendet.');
            bytes += chunk.value.byteLength;
            if (bytes > limit) throw new DavError('Diese Datei überschreitet das verfügbare Offline-Limit.');
            await writer.write(chunk.value);
          }
          if (entry.size !== null && bytes !== entry.size) throw new DavError('Der Download ist unvollständig oder die Datei wurde geändert. Die bisherige Offlinekopie bleibt erhalten.');
          await writer.close();
          return { size: bytes, etag: response.headers.get('etag') || entry.etag };
        } finally { await reader.cancel().catch(() => {}); }
      });
    } catch (error) { await writer.abort().catch(() => {}); throw error; }
    finally { writer.releaseLock(); }
  }
}
