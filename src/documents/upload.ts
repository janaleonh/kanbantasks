import { safeSegments } from './paths';
import { MAX_FILE_BYTES } from './types';

export interface UploadSource { name: string; size: number; body: Blob }

export function uploadPath(folder: string, name: string) {
  if (!name || name === '.' || name === '..' || /[\\/:<>"|?*\u0000-\u001F\u007F]/.test(name)
    || /[. ]$/.test(name) || new TextEncoder().encode(name).length > 255
    || ['@eaDir', '#recycle', '.DS_Store', 'Thumbs.db'].includes(name)) {
    throw new Error('Dieser Dateiname ist nicht erlaubt. Bitte benenne die Datei vor dem Upload um.');
  }
  return [...safeSegments(folder), name].join('/');
}

export function validateUpload(source: UploadSource) {
  uploadPath('', source.name);
  if (!Number.isSafeInteger(source.size) || source.size < 0 || source.size > MAX_FILE_BYTES
    || source.body.size !== source.size) throw new Error('Uploads sind auf 50 MB pro Datei begrenzt. Die Dateigröße muss lesbar sein.');
}
