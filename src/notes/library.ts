import { Directory, File, Paths } from 'expo-file-system';
import { getDatabase } from '../db/database';
import { generateUUID } from '../utils/uuid';

export type Note = { id: string; title: string; body: string; folder: string; tags: string; pinned: number; state: 'active' | 'archived' | 'trash'; updatedAt: string };
export type Attachment = { id: string; name: string; mime: string };
export type InputFile = { uri: string; name: string; mime: string };

export function blankNote(id = generateUUID()): Note {
  return {id, title:'', body:'', folder:'', tags:'', pinned:0, state:'active', updatedAt:new Date().toISOString()};
}
export type TemplateSummary = Pick<Note,'id'|'title'>;
export async function saveTemplate(note: Note) {
  const title = note.title.trim() || note.body.split(/\r?\n/).find(line=>line.trim())?.trim().slice(0,80);
  if (!title) throw new Error('Gib der Vorlage zuerst einen Titel oder Text.');
  const db = await getDatabase();
  await db.runAsync('INSERT OR REPLACE INTO note_templates (id,title,body,folder,tags) VALUES (?,?,?,?,?)',
    [note.id,title,note.body,note.folder,note.tags]);
}
export async function listTemplates() {
  return (await getDatabase()).getAllAsync<TemplateSummary>('SELECT id,title FROM note_templates ORDER BY title COLLATE NOCASE,id');
}
export async function deleteTemplate(id:string) {
  await (await getDatabase()).runAsync('DELETE FROM note_templates WHERE id=?',[id]);
}
export async function createFromTemplate(id:string, folder:string) {
  const db=await getDatabase();
  const template=await db.getFirstAsync<Pick<Note,'title'|'body'|'folder'|'tags'>>(
    'SELECT title,body,folder,tags FROM note_templates WHERE id=?',[id]);
  if (!template) throw new Error('Diese Vorlage ist nicht mehr verfügbar.');
  const note={...blankNote(),...template,folder:folder || template.folder,body:template.body.replace(/^- \[[xX]\] /gm,'- [ ] ')};
  await saveNote(note);
  return note;
}
export async function listNotes() {
  return (await getDatabase()).getAllAsync<Note>('SELECT * FROM notes ORDER BY pinned DESC, updatedAt DESC');
}
export async function readNote(id: string) {
  return (await getDatabase()).getFirstAsync<Note>('SELECT * FROM notes WHERE id=?', [id]);
}
export async function saveNote(note: Note) {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async tx => {
    // Keep the state before each editing session, plus checkpoints during long sessions.
    await tx.runAsync(`INSERT INTO note_versions(noteId,title,body,savedAt)
      SELECT id,title,body,updatedAt FROM notes WHERE id=? AND (title!='' OR body!='')
      AND (title!=? OR body!=?) AND NOT EXISTS (
        SELECT 1 FROM note_versions WHERE noteId=? AND julianday(savedAt)>julianday('now','-5 minutes'))`,
      [note.id,note.title,note.body,note.id]);
    await tx.runAsync('DELETE FROM note_versions WHERE noteId=? AND id NOT IN (SELECT id FROM note_versions WHERE noteId=? ORDER BY id DESC LIMIT 20)',[note.id,note.id]);
    await tx.runAsync(`INSERT INTO notes (id,title,body,folder,tags,pinned,state,updatedAt) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,folder=excluded.folder,tags=excluded.tags,pinned=excluded.pinned,state=excluded.state,updatedAt=excluded.updatedAt`,
    [note.id,note.title,note.body,note.folder,note.tags,note.pinned,note.state,new Date().toISOString()]);
  });
}
export type NoteVersion = { id:number; title:string; body:string; savedAt:string };
export async function noteVersions(id:string) {
  return (await getDatabase()).getAllAsync<NoteVersion>('SELECT id,title,body,savedAt FROM note_versions WHERE noteId=? ORDER BY id DESC', [id]);
}
export async function noteFiles(id: string) {
  return (await getDatabase()).getAllAsync<Attachment>('SELECT id,name,mime FROM note_files WHERE noteId=? ORDER BY rowid',[id]);
}
function directory(id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Ungültige Anlage.');
  return new Directory(Paths.document, 'NoteFiles', id);
}
export function attachmentFile(a: Attachment) {
  if (!a.name || /[\\/\x00-\x1f]/.test(a.name) || a.name === '.' || a.name === '..') throw new Error('Ungültiger Dateiname.');
  return new File(directory(a.id), a.name);
}
// New shares commit the note and its entire selection together.
export async function attachFiles(note: Note, sources: InputFile[], create = false, inbox = false) {
  const db = await getDatabase();
  if (create) {
    if (await readNote(note.id)) return 'note';
    if (await db.getFirstAsync('SELECT delivery FROM inbox_receipts WHERE delivery=?',[note.id])) return 'inbox';
  }
  if (!sources.length || sources.length > 10) throw new Error('Bitte wähle eine bis zehn Dateien.');
  const files = sources.map(s => new File(s.uri));
  const total = files.reduce((n,f) => n + f.size, 0);
  if (files.some(f => !f.exists || f.size > 50*1024*1024) || total > 100*1024*1024 || total + 10*1024*1024 > Paths.availableDiskSpace) throw new Error('Maximal 50 MB je Datei und 100 MB je Auswahl. Bitte prüfe den freien Speicher.');
  const attachments: Attachment[] = [];
  try {
    for (const [index,source] of sources.entries()) {
      const a = {id:generateUUID(),name:source.name,mime:source.mime};
      const dest = attachmentFile(a);
      directory(a.id).create({ intermediates:true });
      attachments.push(a);
      files[index].copy(dest);
    }
    await db.withExclusiveTransactionAsync(async tx => {
      if(inbox){
        await tx.runAsync('INSERT INTO inbox_receipts VALUES (?)',[note.id]);
        for(const a of attachments) await tx.runAsync('INSERT INTO inbox_files VALUES (?,?,?,?)',[a.id,note.id,a.name,a.mime]);
        return;
      }
      if (create) await tx.runAsync('INSERT INTO notes (id,title,body,folder,updatedAt) VALUES (?,?,?,?,?)', [note.id,note.title,note.body,note.folder,note.updatedAt]);
      for (const a of attachments) await tx.runAsync('INSERT INTO note_files VALUES (?,?,?,?)',[a.id,note.id,a.name,a.mime]);
    });
  } catch (error) {
    for (const a of attachments) { const dir=directory(a.id); if (dir.exists) dir.delete(); }
    throw error;
  }
  return inbox ? 'inbox' : 'note';
}
export async function removeAttachment(a: Attachment) {
  await (await getDatabase()).runAsync('DELETE FROM note_files WHERE id=?',[a.id]);
  const dir=directory(a.id); if (dir.exists) dir.delete();
}
export async function trashNote(id: string) {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.runAsync("UPDATE notes SET state='trash', updatedAt=? WHERE id=? AND state!='trash'", [updatedAt, id]);
  return updatedAt;
}

export async function purgeNote(id: string) {
  const files = await noteFiles(id);
  const result = await (await getDatabase()).runAsync("DELETE FROM notes WHERE id=? AND state='trash'",[id]);
  if (result.changes) for (const a of files) { const dir=directory(a.id); if (dir.exists) dir.delete(); }
}
