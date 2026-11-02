import { getDatabase, getSetting } from '../db/database';
import { withPlannerLock } from '../db/plannerLock';
import { parseDetails } from '../tasks/details';
import { generateUUID } from '../utils/uuid';
import { loadCachedUser } from '../auth/googleAuth';
import { validateBackupData, type BackupData } from './format';

export async function collectBackup(): Promise<BackupData> {
  const db = await getDatabase();
  let result: BackupData | null = null;
  await withPlannerLock(() => db.withExclusiveTransactionAsync(async transaction => {
    const lists = await transaction.getAllAsync<any>('SELECT * FROM task_lists WHERE deletedLocally = 0');
    const ids = new Set(lists.map(list => list.id));
    const tasks = await transaction.getAllAsync<any>('SELECT * FROM tasks WHERE deletedLocally = 0');
    const repeatReceipts = await transaction.getAllAsync<any>('SELECT sourceId, nextTaskId FROM task_repeat_receipts');
    const owner = await transaction.getFirstAsync<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'googleTasksOwner'");
    result = validateBackupData({ createdAt: new Date().toISOString(), owner: owner?.value || null,
      lists: lists.map(list => ({ id: list.id, title: list.title, position: list.position, isVisible: list.isVisible !== 0, color: list.color })),
      tasks: tasks.filter(task => ids.has(task.listId)).map(task => ({ ...task, ...parseDetails(task) })), repeatReceipts });
  }));
  return result!;
}

export async function restoreBackup(data: BackupData) {
  data = validateBackupData(data);
  const user = await loadCachedUser();
  const owner = await getSetting('googleTasksOwner', '');
  if (data.owner && ((owner && owner.toLowerCase() !== data.owner) || (user?.email && user.email.toLowerCase() !== data.owner))) throw new Error('Diese Sicherung gehört zu einem anderen Google-Konto. Verbinde zuerst das ursprüngliche Konto.');
  const db = await getDatabase();
  await withPlannerLock(() => db.withExclusiveTransactionAsync(async transaction => {
    const currentOwner = await transaction.getFirstAsync<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'googleTasksOwner'");
    if (data.owner && currentOwner?.value && currentOwner.value.toLowerCase() !== data.owner) throw new Error('Die Kontozuordnung wurde geändert. Die Wiederherstellung wurde gestoppt.');
    if (data.owner && !currentOwner?.value) await transaction.runAsync("INSERT OR REPLACE INTO sync_meta (key,value) VALUES ('googleTasksOwner',?)", [data.owner]);
    const lists = new Map(data.lists.map(list => [list.id, generateUUID()]));
    const tasks = new Map(data.tasks.map(task => [task.id, generateUUID()]));
    const now = new Date().toISOString();
    for (const list of data.lists) await transaction.runAsync("INSERT INTO task_lists (id,title,position,isVisible,color,updatedAt,syncStatus,deletedLocally) VALUES (?,?,?,?,?,?,'pending',0)", [lists.get(list.id)!, `${list.title} · Wiederhergestellt`, list.position, list.isVisible ? 1 : 0, list.color, now]);
    for (const task of data.tasks) await transaction.runAsync(`INSERT INTO tasks (id,listId,title,notes,status,priority,due,reminderAt,localPosition,updatedAt,syncStatus,deletedLocally,recurrence,checklist,attachments,project,tags,repeatSourceId)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending',0,?,?,?,?,?,?)`, [tasks.get(task.id)!, lists.get(task.listId)!, task.title, task.notes, task.status, task.priority, task.due, task.reminderAt, task.localPosition, now,
      task.recurrence ? JSON.stringify(task.recurrence) : null, JSON.stringify(task.checklist || []), JSON.stringify(task.attachments || []), task.project || null, JSON.stringify(task.tags || []), task.repeatSourceId ? tasks.get(task.repeatSourceId)! : null]);
    for (const receipt of data.repeatReceipts) await transaction.runAsync('INSERT INTO task_repeat_receipts (sourceId,nextTaskId) VALUES (?,?)', [tasks.get(receipt.sourceId)!, tasks.get(receipt.nextTaskId) || generateUUID()]);
  }));
  return { lists: data.lists.length, tasks: data.tasks.length };
}
