/**
 * Bidirectional Sync Engine
 *
 * Strategy: "Last Write Wins" based on updatedAt timestamps,
 * with atomic cross-list move persistence, clone deduplication, and 404 resilience.
 */

import { getDatabase } from '../db/database';
import * as taskListRepo from '../db/taskListRepo';
import {
  fetchAllTaskLists,
  fetchAllTasks,
  createRemoteTaskList,
  updateRemoteTaskList,
  deleteRemoteTaskList,
  createRemoteTask,
  updateRemoteTask,
  deleteRemoteTask,
  type GTaskList,
  type GTask,
} from './googleTasksApi';
import { generateUUID } from '../utils/uuid';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

// ──────────────────────────────────────────────────────────
// Main sync entry point
// ──────────────────────────────────────────────────────────
export async function runSync(): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, errors: [] };
  const recentlyRemovedRemoteIds = new Set<string>();

  try {
    // ── Step 0: Self-heal any local duplicates / clones ───
    await cleanupLocalDuplicates();

    // ── Step 1: Sync Task Lists (columns) ─────────────────
    await syncTaskLists(result);

    // ── Step 1.5: Sync Cross-List Task Moves ──────────────
    await syncMovedTasks(result, recentlyRemovedRemoteIds);

    // ── Step 2: Sync Tasks for each list ──────────────────
    const allLists = await taskListRepo.getAllTaskLists();
    for (const list of allLists) {
      if (!list.remoteId) continue;
      await syncTasksForList(
        list.id,
        list.remoteId,
        result,
        recentlyRemovedRemoteIds
      );
    }
  } catch (err) {
    result.errors.push((err as Error).message);
  }

  return result;
}

// ──────────────────────────────────────────────────────────
// Self-heal duplicate remoteIds & multiplied clone tasks
// ──────────────────────────────────────────────────────────
async function cleanupLocalDuplicates(): Promise<void> {
  const db = await getDatabase();

  // 1. Clear no-op moves where previousListId equals current listId
  await db.runAsync(
    'UPDATE tasks SET previousListId = NULL WHERE previousListId IS NOT NULL AND previousListId = listId'
  );

  // 2. Deduplicate rows that share the exact same remoteId
  const dupRemoteGroups = await db.getAllAsync<{ remoteId: string; cnt: number }>(
    `SELECT remoteId, COUNT(*) as cnt
     FROM tasks
     WHERE remoteId IS NOT NULL
     GROUP BY remoteId
     HAVING COUNT(*) > 1`
  );

  for (const grp of dupRemoteGroups) {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM tasks
       WHERE remoteId = ?
       ORDER BY (previousListId IS NOT NULL) DESC, updatedAt DESC`,
      [grp.remoteId]
    );
    for (let i = 1; i < rows.length; i++) {
      await db.runAsync('DELETE FROM tasks WHERE id = ?', [rows[i].id]);
    }
  }

  // 3. Clean up multiplied identical tasks in the same list (same listId, title, notes, status)
  const cloneGroups = await db.getAllAsync<{
    listId: string;
    title: string;
    notes: string;
    status: string;
    cnt: number;
  }>(
    `SELECT listId, title, notes, status, COUNT(*) as cnt
     FROM tasks
     WHERE deletedLocally = 0
     GROUP BY listId, title, notes, status
     HAVING COUNT(*) > 1`
  );

  const now = new Date().toISOString();
  for (const grp of cloneGroups) {
    // Prefer keeping the row that is already cleanly synced in this list (previousListId IS NULL and remoteId IS NOT NULL)
    const rows = await db.getAllAsync<{
      id: string;
      remoteId: string | null;
      previousListId: string | null;
    }>(
      `SELECT id, remoteId, previousListId
       FROM tasks
       WHERE listId = ? AND title = ? AND notes = ? AND status = ? AND deletedLocally = 0
       ORDER BY (previousListId IS NULL AND remoteId IS NOT NULL) DESC, updatedAt ASC`,
      [grp.listId, grp.title, grp.notes, grp.status]
    );

    // Keep rows[0], mark all extra clones for deletion (both locally and remotely)
    for (let i = 1; i < rows.length; i++) {
      const clone = rows[i];
      if (clone.remoteId) {
        await db.runAsync(
          "UPDATE tasks SET deletedLocally = 1, updatedAt = ?, syncStatus = 'pending' WHERE id = ?",
          [now, clone.id]
        );
      } else {
        await db.runAsync('DELETE FROM tasks WHERE id = ?', [clone.id]);
      }
    }
  }
}

// ──────────────────────────────────────────────────────────
// Sync task lists
// ──────────────────────────────────────────────────────────
async function syncTaskLists(result: SyncResult): Promise<void> {
  const db = await getDatabase();
  const [localLists, remoteLists] = await Promise.all([
    db.getAllAsync<any>('SELECT * FROM task_lists'),
    fetchAllTaskLists(),
  ]);

  const remoteById = new Map<string, GTaskList>(
    remoteLists.map((r) => [r.id, r])
  );

  // ── Push local changes ───────────────────────────────────
  for (const local of localLists) {
    try {
      if (local.deletedLocally) {
        if (local.remoteId) {
          try {
            await deleteRemoteTaskList(local.remoteId);
          } catch {}
        }
        // Must remove child tasks & clear previousListId references first to satisfy FOREIGN KEY constraint
        await db.runAsync(
          'UPDATE tasks SET previousListId = NULL WHERE previousListId = ?',
          [local.id]
        );
        await db.runAsync('DELETE FROM tasks WHERE listId = ?', [local.id]);
        await db.runAsync('DELETE FROM task_lists WHERE id = ?', [local.id]);
        result.pushed++;
        continue;
      }

      if (local.syncStatus === 'pending') {
        if (!local.remoteId) {
          const remote = await createRemoteTaskList(local.title);
          await db.runAsync(
            "UPDATE task_lists SET remoteId = ?, syncStatus = 'synced' WHERE id = ?",
            [remote.id, local.id]
          );
          result.pushed++;
        } else if (remoteById.has(local.remoteId)) {
          const remote = remoteById.get(local.remoteId)!;
          if (new Date(local.updatedAt) > new Date(remote.updated)) {
            await updateRemoteTaskList(local.remoteId, local.title);
            result.pushed++;
          }
          await db.runAsync(
            "UPDATE task_lists SET syncStatus = 'synced' WHERE id = ?",
            [local.id]
          );
        } else {
          const remote = await createRemoteTaskList(local.title);
          await db.runAsync(
            "UPDATE task_lists SET remoteId = ?, syncStatus = 'synced' WHERE id = ?",
            [remote.id, local.id]
          );
          result.pushed++;
        }
      }
    } catch (err) {
      result.errors.push(`List ${local.title}: ${(err as Error).message}`);
    }
  }

  // ── Pull remote changes ──────────────────────────────────
  const localByRemoteId = new Map<string, any>(
    localLists.filter((l) => l.remoteId).map((l) => [l.remoteId, l])
  );

  for (const remote of remoteLists) {
    try {
      const local = localByRemoteId.get(remote.id);
      if (!local) {
        const maxPos = await db.getFirstAsync<{ m: number | null }>(
          'SELECT MAX(position) as m FROM task_lists WHERE deletedLocally = 0'
        );
        const pos = (maxPos?.m ?? -1) + 1;
        const color =
          taskListRepo.COLUMN_PALETTE[pos % taskListRepo.COLUMN_PALETTE.length];
        await db.runAsync(
          `INSERT INTO task_lists (id, remoteId, title, position, isVisible, color, updatedAt, syncStatus, deletedLocally)
           VALUES (?, ?, ?, ?, 1, ?, ?, 'synced', 0)`,
          [generateUUID(), remote.id, remote.title, pos, color, remote.updated]
        );
        result.pulled++;
      } else if (
        local.syncStatus === 'synced' &&
        new Date(remote.updated) > new Date(local.updatedAt)
      ) {
        await db.runAsync(
          "UPDATE task_lists SET title = ?, updatedAt = ?, syncStatus = 'synced' WHERE id = ?",
          [remote.title, remote.updated, local.id]
        );
        result.pulled++;
      }
    } catch (err) {
      result.errors.push(`Remote list ${remote.id}: ${(err as Error).message}`);
    }
  }

  // ── Detect remotely deleted lists ────────────────────────
  for (const local of localLists) {
    if (!local.remoteId || local.deletedLocally) continue;
    if (!remoteById.has(local.remoteId) && local.syncStatus === 'synced') {
      await db.runAsync(
        "UPDATE task_lists SET deletedLocally = 1, syncStatus = 'synced' WHERE id = ?",
        [local.id]
      );
      result.pulled++;
    }
  }
}

// ──────────────────────────────────────────────────────────
// Sync tasks moved between columns (lists)
// ──────────────────────────────────────────────────────────
async function syncMovedTasks(
  result: SyncResult,
  recentlyRemovedRemoteIds: Set<string>
): Promise<void> {
  const db = await getDatabase();
  const movedTasks = await db.getAllAsync<any>(
    'SELECT * FROM tasks WHERE previousListId IS NOT NULL'
  );

  for (const task of movedTasks) {
    try {
      const fromList = await taskListRepo.getTaskListById(task.previousListId);
      const toList = await taskListRepo.getTaskListById(task.listId);

      // If the task was moved and then deleted locally (or marked as a duplicate clone)
      if (task.deletedLocally) {
        if (task.remoteId) {
          recentlyRemovedRemoteIds.add(task.remoteId);
          if (fromList?.remoteId) {
            try {
              await deleteRemoteTask(fromList.remoteId, task.remoteId);
            } catch {}
          }
          if (toList?.remoteId && toList.remoteId !== fromList?.remoteId) {
            try {
              await deleteRemoteTask(toList.remoteId, task.remoteId);
            } catch {}
          }
        }
        await db.runAsync('DELETE FROM tasks WHERE id = ?', [task.id]);
        result.pushed++;
        continue;
      }

      // If moved back to the same list or no remote ID yet
      if (
        !task.remoteId ||
        !fromList?.remoteId ||
        fromList.remoteId === toList?.remoteId
      ) {
        await db.runAsync(
          'UPDATE tasks SET previousListId = NULL WHERE id = ?',
          [task.id]
        );
        continue;
      }

      if (toList?.remoteId) {
        const oldRemoteId = task.remoteId;
        recentlyRemovedRemoteIds.add(oldRemoteId);

        // 1. Create the task in the target list
        const newRemote = await createRemoteTask(toList.remoteId, {
          title: task.title,
          notes: task.notes,
          due: task.due,
          status: task.status,
        });

        // 2. IMMEDIATELY persist newRemote.id & clear previousListId in SQLite
        //    BEFORE deleting from the old list, so this task can NEVER multiply!
        await db.runAsync(
          "UPDATE tasks SET remoteId = ?, previousListId = NULL, position = ?, syncStatus = 'synced' WHERE id = ?",
          [newRemote.id, newRemote.position, task.id]
        );
        result.pushed++;

        // 3. Best-effort delete from the source list (never fail the move if already gone)
        try {
          await deleteRemoteTask(fromList.remoteId, oldRemoteId);
        } catch {
          // Ignore errors when cleaning up old task in source list
        }
      }
    } catch (err) {
      result.errors.push(`Move "${task.title}": ${(err as Error).message}`);
    }
  }
}

// ──────────────────────────────────────────────────────────
// Sync tasks for a single list
// ──────────────────────────────────────────────────────────
async function syncTasksForList(
  localListId: string,
  remoteListId: string,
  result: SyncResult,
  recentlyRemovedRemoteIds: Set<string>
): Promise<void> {
  const db = await getDatabase();
  const [localTasks, remoteTasks, allTasksWithRemote] = await Promise.all([
    db.getAllAsync<any>('SELECT * FROM tasks WHERE listId = ?', [localListId]),
    fetchAllTasks(remoteListId),
    db.getAllAsync<{
      id: string;
      listId: string;
      previousListId: string | null;
      remoteId: string;
      deletedLocally: number;
    }>(
      'SELECT id, listId, previousListId, remoteId, deletedLocally FROM tasks WHERE remoteId IS NOT NULL'
    ),
  ]);

  const remoteById = new Map<string, GTask>(
    remoteTasks.map((t) => [t.id, t])
  );

  const globalRemoteIds = new Set<string>(
    allTasksWithRemote.map((t) => t.remoteId)
  );

  // ── Push local changes ───────────────────────────────────
  for (const local of localTasks) {
    try {
      if (local.previousListId && local.previousListId !== localListId) {
        continue;
      }

      if (local.deletedLocally) {
        if (local.remoteId) {
          recentlyRemovedRemoteIds.add(local.remoteId);
          try {
            await deleteRemoteTask(remoteListId, local.remoteId);
          } catch {}
        }
        await db.runAsync('DELETE FROM tasks WHERE id = ?', [local.id]);
        result.pushed++;
        continue;
      }

      if (local.syncStatus === 'pending') {
        if (!local.remoteId) {
          // Only create if remoteId is genuinely null (never synced yet)
          const remote = await createRemoteTask(remoteListId, {
            title: local.title,
            notes: local.notes,
            due: local.due ?? undefined,
            status: local.status,
          });
          await db.runAsync(
            "UPDATE tasks SET remoteId = ?, previousListId = NULL, position = ?, syncStatus = 'synced' WHERE id = ?",
            [remote.id, remote.position, local.id]
          );
          globalRemoteIds.add(remote.id);
          result.pushed++;
        } else if (remoteById.has(local.remoteId)) {
          const remote = remoteById.get(local.remoteId)!;
          if (new Date(local.updatedAt) > new Date(remote.updated)) {
            await updateRemoteTask(remoteListId, local.remoteId, {
              title: local.title,
              notes: local.notes,
              status: local.status,
              due: local.due,
            });
            result.pushed++;
          }
          await db.runAsync(
            "UPDATE tasks SET syncStatus = 'synced' WHERE id = ?",
            [local.id]
          );
        } else {
          // Task had a remoteId that is no longer in this remote list
          await db.runAsync(
            "UPDATE tasks SET syncStatus = 'synced' WHERE id = ?",
            [local.id]
          );
        }
      }
    } catch (err) {
      result.errors.push(`Task "${local.title}": ${(err as Error).message}`);
    }
  }

  // ── Pull remote changes ──────────────────────────────────
  const localByRemoteId = new Map<string, any>(
    localTasks.filter((t) => t.remoteId).map((t) => [t.remoteId, t])
  );
  let remotePosition = 0;

  for (const remote of remoteTasks) {
    try {
      if (remote.deleted || recentlyRemovedRemoteIds.has(remote.id)) {
        continue;
      }

      const local = localByRemoteId.get(remote.id);
      if (!local) {
        if (globalRemoteIds.has(remote.id)) {
          continue;
        }

        await db.runAsync(
          `INSERT INTO tasks
             (id, remoteId, listId, title, notes, status, due, position, localPosition, updatedAt, syncStatus, deletedLocally)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', 0)`,
          [
            generateUUID(),
            remote.id,
            localListId,
            remote.title,
            remote.notes ?? '',
            remote.status,
            remote.due ?? null,
            remote.position,
            remotePosition,
            remote.updated,
          ]
        );
        globalRemoteIds.add(remote.id);
        result.pulled++;
      } else if (
        local.syncStatus === 'synced' &&
        !local.previousListId &&
        new Date(remote.updated) > new Date(local.updatedAt)
      ) {
        await db.runAsync(
          `UPDATE tasks
           SET title = ?, notes = ?, status = ?, due = ?, position = ?, updatedAt = ?, syncStatus = 'synced'
           WHERE id = ?`,
          [
            remote.title,
            remote.notes ?? '',
            remote.status,
            remote.due ?? null,
            remote.position,
            remote.updated,
            local.id,
          ]
        );
        result.pulled++;
      }
    } catch (err) {
      result.errors.push(`Remote task ${remote.id}: ${(err as Error).message}`);
    }
    remotePosition++;
  }

  // ── Detect remotely deleted tasks ────────────────────────
  for (const local of localTasks) {
    if (!local.remoteId || local.deletedLocally || local.previousListId) continue;
    if (!remoteById.has(local.remoteId) && local.syncStatus === 'synced') {
      await db.runAsync(
        "UPDATE tasks SET deletedLocally = 1, syncStatus = 'synced' WHERE id = ?",
        [local.id]
      );
      result.pulled++;
    }
  }
}
