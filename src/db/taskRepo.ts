import { getDatabase } from './database';
import { generateUUID } from '../utils/uuid';

export type TaskPriority = 'none' | 'low' | 'medium' | 'high';

export interface Task {
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
  return {
    ...row,
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

export async function updateTask(
  id: string,
  updates: Partial<Pick<Task, 'title' | 'notes' | 'status' | 'due' | 'priority' | 'reminderAt'>>
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const setClauses: string[] = ['updatedAt = ?', "syncStatus = 'pending'"];
  const values: (string | null)[] = [now];

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
  const now = new Date().toISOString();

  const existing = await db.getFirstAsync<TaskRow>(
    'SELECT * FROM tasks WHERE id = ?',
    [taskId]
  );
  if (!existing) return;

  // Shift existing tasks in target list to make room (local order only, do not mark pending)
  await db.runAsync(
    'UPDATE tasks SET localPosition = localPosition + 1 WHERE listId = ? AND localPosition >= ? AND deletedLocally = 0',
    [toListId, toPosition]
  );

  // If moving within the same list, only update localPosition
  if (existing.listId === toListId) {
    await db.runAsync(
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

  await db.runAsync(
    'UPDATE tasks SET listId = ?, previousListId = ?, localPosition = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
    [toListId, prevListId, toPosition, now, 'pending', taskId]
  );
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
  await db.runAsync(
    'UPDATE tasks SET deletedLocally = 1, updatedAt = ?, syncStatus = ? WHERE id = ?',
    [now, 'pending', id]
  );
}

export async function toggleTaskStatus(id: string): Promise<Task['status']> {
  const db = await getDatabase();
  const task = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!task) throw new Error(`Task ${id} not found`);
  
  const newStatus = task.status === 'needsAction' ? 'completed' : 'needsAction';
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE tasks SET status = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
    [newStatus, now, 'pending', id]
  );
  return newStatus as Task['status'];
}
