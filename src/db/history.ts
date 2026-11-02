import { create } from 'zustand';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from './database';
import { generateUUID } from '../utils/uuid';
import { withPlannerLock } from './plannerLock';

type Row = Record<string, any>;
export type HistoryEntry = { id: string; taskId: string; label: string; beforeJson: string; afterJson: string; createdAt: string; undone: number };
export const useUndoState = create<{ last: { id: string; label: string } | null }>(() => ({ last: null }));
export const announceHistory = (id: string | null, label: string) => { if (id) useUndoState.setState({ last: { id, label } }); };
const fields = ['title', 'notes', 'status', 'due', 'priority', 'reminderAt', 'listId', 'recurrence', 'checklist', 'attachments', 'project', 'tags', 'deletedLocally'];
const semantic = (row: Row) => JSON.stringify(fields.map(key => row[key] ?? null));

export async function recordTaskHistory(db: SQLiteDatabase, before: Row | null, after: Row | null, label: string) {
  if (!before || !after || semantic(before) === semantic(after)) return null;
  const id = generateUUID();
  const list = await db.getFirstAsync<Row>('SELECT * FROM task_lists WHERE id = ?', [before.listId]);
  await db.runAsync('INSERT INTO task_history (id, taskId, label, beforeJson, afterJson, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [id, before.id, label, JSON.stringify({ task: before, list }), JSON.stringify(after), new Date().toISOString()]);
  await db.runAsync('DELETE FROM task_history WHERE id NOT IN (SELECT id FROM task_history ORDER BY createdAt DESC, rowid DESC LIMIT 200)');
  return id;
}

export async function recordListDeletion(db: SQLiteDatabase, list: Row, tasks: Row[]) {
  const id = generateUUID();
  await db.runAsync('INSERT INTO task_history (id, taskId, label, beforeJson, afterJson, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [id, `list:${list.id}`, `Liste „${list.title}“ gelöscht`, JSON.stringify({ list, tasks }), JSON.stringify({ listDeleted: true }), new Date().toISOString()]);
  await db.runAsync('DELETE FROM task_history WHERE id NOT IN (SELECT id FROM task_history ORDER BY createdAt DESC, rowid DESC LIMIT 200)');
  return id;
}

export async function getHistory() {
  return (await getDatabase()).getAllAsync<HistoryEntry>('SELECT * FROM task_history ORDER BY createdAt DESC, rowid DESC LIMIT 100');
}

async function newList(db: SQLiteDatabase, list: Row | null) {
  const id = generateUUID();
  await db.runAsync("INSERT INTO task_lists (id, title, position, isVisible, color, updatedAt, syncStatus, deletedLocally) VALUES (?, ?, 0, 1, ?, ?, 'pending', 0)", [id, list?.title || 'Wiederhergestellt', list?.color || null, new Date().toISOString()]);
  return id;
}

async function writeTask(db: SQLiteDatabase, before: Row, id: string, listId: string, remoteId: string | null, previousListId: string | null, copy: boolean) {
  const columns = ['id', 'remoteId', 'listId', 'previousListId', 'title', 'notes', 'status', 'priority', 'due', 'reminderAt', 'localPosition', 'updatedAt', 'syncStatus', 'deletedLocally', 'recurrence', 'checklist', 'attachments', 'project', 'tags', 'repeatSourceId', 'position'];
  const values = [id, remoteId, listId, previousListId, before.title, before.notes || '', copy ? 'needsAction' : before.status, before.priority || 'none', before.due || null, before.reminderAt || null, before.localPosition || 0, new Date().toISOString(), 'pending', 0, before.recurrence || null, before.checklist || null, before.attachments || null, before.project || null, before.tags || null, copy ? null : before.repeatSourceId || null, copy ? null : before.position || null];
  await db.runAsync(`INSERT OR REPLACE INTO tasks (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values);
}

export async function restoreHistory(id: string, copy = false) {
  const db = await getDatabase();
  await withPlannerLock(() => db.withExclusiveTransactionAsync(async transaction => {
    const entry = await transaction.getFirstAsync<HistoryEntry>('SELECT * FROM task_history WHERE id = ?', [id]);
    if (!entry || entry.undone) throw new Error('Dieser Eintrag wurde bereits wiederhergestellt.');
    const before = JSON.parse(entry.beforeJson), after = JSON.parse(entry.afterJson);
    if (Array.isArray(before.tasks)) {
      const original = await transaction.getFirstAsync<Row>('SELECT * FROM task_lists WHERE id = ?', [before.list.id]);
      if (!copy && original && !original.deletedLocally) throw new Error('Die Liste ist inzwischen wieder vorhanden. Du kannst eine neue Kopie anlegen.');
      const listId = await newList(transaction, before.list);
      for (const task of before.tasks) await writeTask(transaction, { ...task, repeatSourceId: null, recurrence: task.status === 'completed' ? null : task.recurrence }, generateUUID(), listId, null, null, false);
    } else {
      const task: Row = before.task;
      const current = await transaction.getFirstAsync<Row>('SELECT * FROM tasks WHERE id = ?', [entry.taskId]);
      if (!copy && ((current && semantic(current) !== semantic(after)) || (!current && !after.deletedLocally))) throw new Error('Die Aufgabe wurde inzwischen verändert. Stelle den alten Stand als neue Kopie wieder her.');
      const list = await transaction.getFirstAsync<Row>('SELECT * FROM task_lists WHERE id = ? AND deletedLocally = 0', [task.listId]);
      const listId = list?.id || await newList(transaction, before.list);
      let previous = current?.previousListId || null;
      if (current?.remoteId && current.listId !== listId) { previous = previous || current.listId; if (previous === listId) previous = null; }
      await writeTask(transaction, task, copy ? generateUUID() : task.id, listId, copy ? null : current?.remoteId || null, copy ? null : previous, copy);
    }
    await transaction.runAsync('UPDATE task_history SET undone = 1 WHERE id = ?', [id]);
  }));
  if (useUndoState.getState().last?.id === id) useUndoState.setState({ last: null });
}
