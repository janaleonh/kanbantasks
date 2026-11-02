import { validateDetails, type TaskDetails } from '../tasks/details';

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export type BackupList = { id: string; title: string; position: number; isVisible: boolean; color: string | null };
export type BackupTask = TaskDetails & { id: string; listId: string; title: string; notes: string; status: 'needsAction' | 'completed'; priority: 'none' | 'low' | 'medium' | 'high'; due: string | null; reminderAt: string | null; localPosition: number; repeatSourceId: string | null };
export type BackupData = { createdAt: string; owner: string | null; lists: BackupList[]; tasks: BackupTask[]; repeatReceipts: { sourceId: string; nextTaskId: string }[] };
const text = (value: unknown, max: number, empty = false): string => { if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /\u0000/.test(value)) throw new Error('Die Sicherung enthält ungültige Texte.'); return value; };
const id = (value: unknown) => text(value, 200);
const date = (value: unknown) => { if (value === null || value === undefined) return null; const result = text(value, 64); if (!Number.isFinite(new Date(result).getTime())) throw new Error('Die Sicherung enthält ein ungültiges Datum.'); return result; };
const position = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1000000 ? value : 0;

export function validateBackupData(input: any): BackupData {
  if (!input || !Array.isArray(input.lists) || !Array.isArray(input.tasks) || input.lists.length > 1000 || input.tasks.length > 20000) throw new Error('Die Sicherung ist ungültig oder zu groß.');
  const createdAt = date(input.createdAt);
  if (!createdAt) throw new Error('Das Sicherungsdatum fehlt.');
  const owner = input.owner === null ? null : text(input.owner, 320).trim().toLowerCase();
  if (owner && (!owner.includes('@') || /\s/.test(owner))) throw new Error('Die Kontozuordnung der Sicherung ist ungültig.');
  const listIds = new Set<string>(), taskIds = new Set<string>();
  const lists = input.lists.map((value: any): BackupList => {
    const key = id(value.id); if (listIds.has(key)) throw new Error('Doppelte Listen-ID in der Sicherung.'); listIds.add(key);
    if (typeof value.isVisible !== 'boolean') throw new Error('Ungültige Listeneinstellung.');
    return { id: key, title: text(value.title, 1000), position: position(value.position), isVisible: value.isVisible, color: typeof value.color === 'string' && /^#[a-f0-9]{6}([a-f0-9]{2})?$/i.test(value.color) ? value.color : null };
  });
  const tasks = input.tasks.map((value: any): BackupTask => {
    const key = id(value.id), listId = id(value.listId);
    if (taskIds.has(key) || !listIds.has(listId)) throw new Error('Ungültige Aufgaben-/Listen-Zuordnung in der Sicherung.'); taskIds.add(key);
    if (!['needsAction', 'completed'].includes(value.status) || !['none', 'low', 'medium', 'high'].includes(value.priority)) throw new Error('Ungültiger Aufgabenstatus.');
    const details = validateDetails({ recurrence: value.recurrence ?? null, checklist: value.checklist || [], attachments: value.attachments || [], project: value.project ?? null, tags: value.tags || [] });
    return { ...details, id: key, listId, title: text(value.title, 1000, true), notes: text(value.notes ?? '', 100000, true), status: value.status, priority: value.priority, due: date(value.due), reminderAt: date(value.reminderAt), localPosition: position(value.localPosition), repeatSourceId: value.repeatSourceId ? id(value.repeatSourceId) : null };
  });
  if (!Array.isArray(input.repeatReceipts) || input.repeatReceipts.length > 100000) throw new Error('Ungültige Wiederholungsbelege.');
  const seen = new Set<string>();
  const repeatReceipts = input.repeatReceipts.map((value: any) => {
    const sourceId = id(value.sourceId), nextTaskId = id(value.nextTaskId);
    if (seen.has(sourceId)) throw new Error('Doppelter Wiederholungsbeleg.'); seen.add(sourceId);
    return { sourceId, nextTaskId };
  }).filter((value: { sourceId: string }) => taskIds.has(value.sourceId));
  for (const task of tasks) if (task.repeatSourceId && !taskIds.has(task.repeatSourceId)) task.repeatSourceId = null;
  return { createdAt, owner, lists, tasks, repeatReceipts };
}

export function decodeBackup(source: string) {
  if (new TextEncoder().encode(source).byteLength > MAX_BACKUP_BYTES) throw new Error('Die Sicherung ist größer als 10 MB.');
  const input = JSON.parse(source);
  if (input?.format !== 'planner-backup' || input.version !== 1 || !/^[a-f0-9]{64}$/.test(input.checksum)) throw new Error('Diese Datei ist keine unterstützte Planner-Sicherung.');
  return { data: validateBackupData(input.data), payload: JSON.stringify(input.data), checksum: input.checksum as string };
}
