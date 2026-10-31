import { getDatabase } from './database';
import { generateUUID } from '../utils/uuid';

export const COLUMN_PALETTE = [
  '#007AFF', // Blue
  '#FF9500', // Orange
  '#34C759', // Green
  '#AF52DE', // Purple
  '#FF3B30', // Red
  '#5AC8FA', // Light Blue
  '#FF2D55', // Pink
  '#FFCC00', // Yellow
  '#5856D6', // Indigo
  '#00C7BE', // Teal
];

export interface TaskList {
  id: string;
  remoteId: string | null;
  title: string;
  position: number;
  isVisible: boolean;
  color: string | null;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  deletedLocally: boolean;
}

interface TaskListRow {
  id: string;
  remoteId: string | null;
  title: string;
  position: number;
  isVisible: number | null;
  color: string | null;
  updatedAt: string;
  syncStatus: string;
  deletedLocally: number;
}

function rowToTaskList(row: TaskListRow): TaskList {
  return {
    ...row,
    isVisible: row.isVisible === null || row.isVisible === undefined ? true : row.isVisible === 1,
    color: row.color ?? null,
    syncStatus: row.syncStatus as TaskList['syncStatus'],
    deletedLocally: row.deletedLocally === 1,
  };
}

export async function getAllTaskLists(): Promise<TaskList[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TaskListRow>(
    'SELECT * FROM task_lists WHERE deletedLocally = 0 ORDER BY position ASC'
  );
  return rows.map(rowToTaskList);
}

export async function getTaskListById(id: string): Promise<TaskList | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TaskListRow>(
    'SELECT * FROM task_lists WHERE id = ?',
    [id]
  );
  return row ? rowToTaskList(row) : null;
}

export async function createTaskList(title: string, color: string | null = null): Promise<TaskList> {
  const db = await getDatabase();
  const id = generateUUID();
  const now = new Date().toISOString();

  const maxPos = await db.getFirstAsync<{ maxPos: number | null }>(
    'SELECT MAX(position) as maxPos FROM task_lists WHERE deletedLocally = 0'
  );
  const position = (maxPos?.maxPos ?? -1) + 1;
  const resolvedColor = color ?? COLUMN_PALETTE[position % COLUMN_PALETTE.length];

  await db.runAsync(
    'INSERT INTO task_lists (id, remoteId, title, position, isVisible, color, updatedAt, syncStatus, deletedLocally) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 0)',
    [id, null, title, position, resolvedColor, now, 'pending']
  );

  return {
    id,
    remoteId: null,
    title,
    position,
    isVisible: true,
    color: resolvedColor,
    updatedAt: now,
    syncStatus: 'pending',
    deletedLocally: false,
  };
}

export async function updateTaskList(id: string, title: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE task_lists SET title = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
    [title, now, 'pending', id]
  );
}

export async function setTaskListVisibility(id: string, isVisible: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE task_lists SET isVisible = ? WHERE id = ?',
    [isVisible ? 1 : 0, id]
  );
}

export async function setTaskListColor(id: string, color: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE task_lists SET color = ? WHERE id = ?',
    [color, id]
  );
}

export async function deleteTaskList(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE task_lists SET deletedLocally = 1, updatedAt = ?, syncStatus = ? WHERE id = ?',
    [now, 'pending', id]
  );
  await db.runAsync(
    'UPDATE tasks SET deletedLocally = 1, updatedAt = ?, syncStatus = ? WHERE listId = ?',
    [now, 'pending', id]
  );
}

export async function reorderTaskLists(orderedIds: string[]): Promise<void> {
  const db = await getDatabase();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.runAsync(
      'UPDATE task_lists SET position = ? WHERE id = ?',
      [i, orderedIds[i]]
    );
  }
}

export async function clearUnsyncedEmptyLists(): Promise<void> {
  const db = await getDatabase();
  const emptyLists = await db.getAllAsync<{ id: string }>(`
    SELECT id FROM task_lists
    WHERE remoteId IS NULL
      AND id NOT IN (SELECT DISTINCT listId FROM tasks WHERE deletedLocally = 0)
  `);
  for (const l of emptyLists) {
    await db.runAsync(
      'UPDATE tasks SET previousListId = NULL WHERE previousListId = ?',
      [l.id]
    );
    await db.runAsync('DELETE FROM tasks WHERE listId = ?', [l.id]);
    await db.runAsync('DELETE FROM task_lists WHERE id = ?', [l.id]);
  }
}

export async function resetLocalDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM tasks;
    DELETE FROM task_lists;
  `);
}
