import { getDatabase } from './database';
import { generateUUID } from '../utils/uuid';
import type { SQLiteDatabase } from 'expo-sqlite';
import { nextOccurrence, parseDetails, validateDetails, type TaskDetails } from '../tasks/details';
import { recordTaskHistory, announceHistory } from './history';

let taskTransactions: Promise<void> = Promise.resolve();
function taskTransaction(db: SQLiteDatabase, work: (transaction: SQLiteDatabase) => Promise<void>) {
  const next = taskTransactions.catch(() => {}).then(() => db.withExclusiveTransactionAsync(work));
  taskTransactions = next;
  return next;
}

export type TaskPriority = 'none' | 'low' | 'medium' | 'high';

export interface Task extends TaskDetails {
  id: string;
  remoteId: string | null;
  listId: string;
  previousListId: string | null;
  title: string;
  notes: string;
  status: 'needsAction' | 'completed';
  priority: TaskPriority;
  due: string | null;
  reminderAt: string | null;
  position: string | null;
  localPosition: number;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  deletedLocally: boolean;
}

interface TaskRow {
  project?: string | null;
  tags?: string | null;
  recurrence?: string | null;
  checklist?: string | null;
  attachments?: string | null;
  id: string;
  remoteId: string | null;
  listId: string;
  previousListId: string | null;
  title: string;
  notes: string;
  status: string;
  priority: string | null;
  due: string | null;
  reminderAt: string | null;
  position: string | null;
  localPosition: number;
  updatedAt: string;
  syncStatus: string;
  deletedLocally: number;
}

function rowToTask(row: TaskRow): Task {
  const details = parseDetails(row);
  return {
    ...row,
    recurrence: details.recurrence ?? null,
    checklist: details.checklist ?? [],
    attachments: details.attachments ?? [],
    project: details.project ?? null,
    tags: details.tags ?? [],
    status: row.status as Task['status'],
    priority: (row.priority as TaskPriority) || 'none',
    reminderAt: row.reminderAt ?? null,
    syncStatus: row.syncStatus as Task['syncStatus'],
    deletedLocally: row.deletedLocally === 1,
  };
}

export async function getTasksByListId(listId: string): Promise<Task[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TaskRow>(
    'SELECT * FROM tasks WHERE listId = ? AND deletedLocally = 0 ORDER BY localPosition ASC',
    [listId]
  );
  return rows.map(rowToTask);
}

export async function getAllTasks(): Promise<Task[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TaskRow>(
    'SELECT * FROM tasks WHERE deletedLocally = 0 ORDER BY localPosition ASC'
  );
  return rows.map(rowToTask);
}

export async function getTaskById(id: string): Promise<Task | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TaskRow>(
    'SELECT * FROM tasks WHERE id = ?',
    [id]
  );
  return row ? rowToTask(row) : null;
}

export async function createTask(
  listId: string,
  title: string,
  notes: string = '',
  due: string | null = null,
  priority: TaskPriority = 'none',
  reminderAt: string | null = null
): Promise<Task> {
  const db = await getDatabase();
  const id = generateUUID();
  const now = new Date().toISOString();

  const maxPos = await db.getFirstAsync<{ maxPos: number | null }>(
    'SELECT MAX(localPosition) as maxPos FROM tasks WHERE listId = ? AND deletedLocally = 0',
    [listId]
  );
  const localPosition = (maxPos?.maxPos ?? -1) + 1;

  await db.runAsync(
    `INSERT INTO tasks (id, remoteId, listId, previousListId, title, notes, status, priority, due, reminderAt, position, localPosition, updatedAt, syncStatus, deletedLocally)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, null, listId, null, title, notes, 'needsAction', priority, due, reminderAt, null, localPosition, now, 'pending', 0]
  );

  return {
    id,
    remoteId: null,
    listId,
    previousListId: null,
    title,
    notes,
    status: 'needsAction',
    priority,
    due,
    reminderAt,
    position: null,
    localPosition,
    updatedAt: now,
    syncStatus: 'pending',
    deletedLocally: false,
  };
}

export type TaskUpdates = Partial<Pick<Task, 'title' | 'notes' | 'status' | 'due' | 'priority' | 'reminderAt'>> & TaskDetails;

export async function updateTask(
  id: string,
  updates: TaskUpdates
): Promise<void> {
  const db = await getDatabase();
  let pendingHistory: string | null = null;
  await taskTransaction(db, async transaction => {
    const before = await transaction.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
    await updateTaskInTransaction(transaction, id, updates);
    if (updates.status === 'completed') await createNextInTransaction(transaction, id);
    const after = await transaction.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
    const history = await recordTaskHistory(transaction, before, after, 'Aufgabe bearbeitet');
    if (history) pendingHistory = history;
  });
  announceHistory(pendingHistory, 'Aufgabe bearbeitet');
}

async function updateTaskInTransaction(db: SQLiteDatabase, id: string, updates: TaskUpdates) {
  const now = new Date().toISOString();

  const setClauses: string[] = ['updatedAt = ?', "syncStatus = 'pending'"];
  const values: (string | null)[] = [now];
  const details = validateDetails(updates);
  for (const key of ['recurrence', 'checklist', 'attachments', 'project', 'tags'] as const) {
    if (details[key] !== undefined) { setClauses.push(`${key} = ?`); values.push(details[key] === null ? null : key === 'project' ? details.project! : JSON.stringify(details[key])); }
  }

  if (updates.title !== undefined) {
    setClauses.push('title = ?');
    values.push(updates.title);
  }
  if (updates.notes !== undefined) {
    setClauses.push('notes = ?');
    values.push(updates.notes);
  }
  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    values.push(updates.status);
  }
  if (updates.due !== undefined) {
    setClauses.push('due = ?');
    values.push(updates.due);
  }
  if (updates.priority !== undefined) {
    setClauses.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.reminderAt !== undefined) {
    setClauses.push('reminderAt = ?');
    values.push(updates.reminderAt);
  }

  values.push(id);
  await db.runAsync(
    `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  );
}

export async function moveTask(
  taskId: string,
  toListId: string,
  toPosition: number
): Promise<void> {
  const db = await getDatabase();
  let history: string | null = null;
  await taskTransaction(db, async transaction => {
  const before = await transaction.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [taskId]);
  const now = new Date().toISOString();

  const existing = await transaction.getFirstAsync<TaskRow>(
    'SELECT * FROM tasks WHERE id = ?',
    [taskId]
  );
  if (!existing) return;
  if (!await transaction.getFirstAsync('SELECT id FROM task_lists WHERE id = ? AND deletedLocally = 0', [toListId])) throw new Error('Die Zielliste ist nicht mehr vorhanden.');

  // Shift existing tasks in target list to make room (local order only, do not mark pending)
  await transaction.runAsync(
    'UPDATE tasks SET localPosition = localPosition + 1 WHERE listId = ? AND localPosition >= ? AND deletedLocally = 0',
    [toListId, toPosition]
  );

  // If moving within the same list, only update localPosition
  if (existing.listId === toListId) {
    await transaction.runAsync(
      'UPDATE tasks SET localPosition = ? WHERE id = ?',
      [toPosition, taskId]
    );
    return;
  }

  // Track original listId if moving across lists and task exists on remote
  let prevListId = existing.previousListId ?? null;
  if (!existing.remoteId) {
    prevListId = null;
  } else if (!prevListId) {
    prevListId = existing.listId;
  } else if (prevListId === toListId) {
    // Moved back to original remote list before sync ran
    prevListId = null;
  }

  await transaction.runAsync(
    'UPDATE tasks SET listId = ?, previousListId = ?, localPosition = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
    [toListId, prevListId, toPosition, now, 'pending', taskId]
  );
  const after = await transaction.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [taskId]);
  history = await recordTaskHistory(transaction, before, after, 'Aufgabe verschoben');
  });
  announceHistory(history, 'Aufgabe verschoben');
}

export async function reorderTasksInList(listId: string, orderedTaskIds: string[]): Promise<void> {
  const db = await getDatabase();
  for (let i = 0; i < orderedTaskIds.length; i++) {
    await db.runAsync(
      'UPDATE tasks SET localPosition = ? WHERE id = ?',
      [i, orderedTaskIds[i]]
    );
  }
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  let history: string | null = null;
  await taskTransaction(db, async transaction => {
  const before = await transaction.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  await transaction.runAsync(
    'UPDATE tasks SET deletedLocally = 1, updatedAt = ?, syncStatus = ? WHERE id = ?',
    [now, 'pending', id]
  );
  history = await recordTaskHistory(transaction, before, await transaction.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]), 'Aufgabe gelöscht');
  });
  announceHistory(history, 'Aufgabe gelöscht');
}

export async function toggleTaskStatus(id: string): Promise<Task['status']> {
  const db = await getDatabase();
  let newStatus: Task['status'] = 'needsAction';
  let history: string | null = null;
  await taskTransaction(db, async transaction => {
  const task = await transaction.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!task) throw new Error(`Task ${id} not found`);
  
  newStatus = task.status === 'needsAction' ? 'completed' : 'needsAction';
  await updateTaskInTransaction(transaction, id, { status: newStatus });
  if (newStatus === 'completed') await createNextInTransaction(transaction, id);
  history = await recordTaskHistory(transaction, task, await transaction.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]), 'Status geändert');
  });
  announceHistory(history, 'Status geändert');
  return newStatus;
}

async function createNextInTransaction(db: SQLiteDatabase, id: string) {
  const row = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!row || row.deletedLocally || row.status !== 'completed') return;
  if (!await db.getFirstAsync('SELECT id FROM task_lists WHERE id = ? AND deletedLocally = 0', [row.listId])) return;
  const task = rowToTask(row);
  if (!task.recurrence) return;
  if (await db.getFirstAsync('SELECT sourceId FROM task_repeat_receipts WHERE sourceId = ?', [id])) return;
  const next = nextOccurrence(task.due, task.recurrence);
  const reminder = task.reminderAt && task.due ? new Date(new Date(next.due).getTime() + new Date(task.reminderAt).getTime() - new Date(task.due).getTime()) : null;
  const nextId = generateUUID();
  await db.runAsync(`INSERT INTO tasks (id, listId, title, notes, status, priority, due, reminderAt, localPosition, updatedAt, syncStatus, deletedLocally, recurrence, checklist, attachments, repeatSourceId, project, tags)
    VALUES (?, ?, ?, ?, 'needsAction', ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?)`, [
    nextId, task.listId, task.title, task.notes, task.priority, next.due,
    reminder && Number.isFinite(reminder.getTime()) && reminder > new Date() ? reminder.toISOString() : null,
    task.localPosition + 1, new Date().toISOString(), JSON.stringify(next.recurrence),
    JSON.stringify((task.checklist || []).map(item => ({ ...item, done: false }))), JSON.stringify(task.attachments || []), id, task.project || null, JSON.stringify(task.tags || []),
  ]);
  await db.runAsync('INSERT INTO task_repeat_receipts (sourceId, nextTaskId) VALUES (?, ?)', [id, nextId]);
  return true;
}

export async function materializeCompletedRepeats() {
  const db = await getDatabase();
  let created = 0;
  await taskTransaction(db, async transaction => {
    const rows = await transaction.getAllAsync<{ id: string }>(`SELECT id FROM tasks WHERE status = 'completed' AND deletedLocally = 0 AND recurrence IS NOT NULL
      AND id NOT IN (SELECT sourceId FROM task_repeat_receipts)`);
    for (const row of rows) if (await createNextInTransaction(transaction, row.id)) created++;
  });
  return created;
}

export async function captureTask(title: string, notes: string, listId: string | null, receiptId: string, scan?: { id: string; due: string | null }, sourceNoteId?: string) {
  if (!title.trim() || title.length > 1000 || notes.length > 20000 || !receiptId || receiptId.length > 200) throw new Error('Bitte gib einen gültigen Aufgabentitel ein.');
  const db = await getDatabase();
  let taskId = '';
  await taskTransaction(db, async transaction => {
    const receipt = await transaction.getFirstAsync<{ taskId: string }>('SELECT taskId FROM capture_receipts WHERE id = ?', [receiptId]);
    if (receipt) { taskId = receipt.taskId; return; }
    let target = listId ? await transaction.getFirstAsync<{ id: string }>('SELECT id FROM task_lists WHERE id = ? AND deletedLocally = 0', [listId]) : await transaction.getFirstAsync<{ id: string }>('SELECT id FROM task_lists WHERE deletedLocally = 0 AND isVisible = 1 ORDER BY position ASC LIMIT 1');
    const now = new Date().toISOString();
    if (listId && !target) throw new Error('Die gewählte Liste ist nicht mehr verfügbar.');
    if (!target) {
      target = { id: generateUUID() };
      await transaction.runAsync("INSERT INTO task_lists (id, title, position, isVisible, updatedAt, syncStatus, deletedLocally) VALUES (?, 'Eingang', 0, 1, ?, 'pending', 0)", [target.id, now]);
    }
    taskId = generateUUID();
    await transaction.runAsync("INSERT INTO tasks (id, listId, title, notes, status, priority, localPosition, updatedAt, syncStatus, deletedLocally) VALUES (?, ?, ?, ?, 'needsAction', 'none', 0, ?, 'pending', 0)", [taskId, target.id, title.trim(), notes, now]);
    if (scan) {
      if (!await transaction.getFirstAsync('SELECT id FROM scans WHERE id = ?', [scan.id])) throw new Error('Der Scan ist nicht mehr auf diesem Gerät.');
      await transaction.runAsync('INSERT INTO scan_tasks (taskId, scanId) VALUES (?, ?)', [taskId, scan.id]);
      if (scan.due) await transaction.runAsync('UPDATE tasks SET due = ? WHERE id = ?', [scan.due, taskId]);
    }
    if (sourceNoteId) {
      const link = await transaction.runAsync("INSERT INTO note_tasks (taskId,noteId) SELECT ?, id FROM notes WHERE id=? AND state!='trash'", [taskId,sourceNoteId]);
      if (!link.changes) throw new Error('Die ursprüngliche Notiz ist nicht mehr verfügbar.');
    }
    await transaction.runAsync('INSERT INTO capture_receipts (id, taskId) VALUES (?, ?)', [receiptId, taskId]);
  });
  return taskId;
}
