import { create } from 'zustand';
import type { TaskList } from '../db/taskListRepo';
import type { Task, TaskPriority } from '../db/taskRepo';
import type { DesignPreset } from '../hooks/useTheme';
import * as taskListRepo from '../db/taskListRepo';
import * as taskRepo from '../db/taskRepo';
import { getSetting, setSetting } from '../db/database';
import { runSync, type SyncStatus } from '../sync/syncEngine';
import { getValidAccessToken } from '../auth/googleAuth';
import {
  scheduleTaskReminder,
  cancelTaskReminder,
  updateDailyBriefingNotification,
} from '../services/notifications';
import * as Haptics from 'expo-haptics';

export type ThemeMode = 'system' | 'light' | 'dark';
export type DueFilter = 'all' | 'today' | 'overdue';
export type BoardLayout = 'horizontal' | 'vertical';

interface KanbanState {
  taskLists: TaskList[];
  tasksByList: Record<string, Task[]>;
  isLoading: boolean;
  syncState: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;

  // Preferences & Filters
  showCompletedByDefault: boolean;
  themeMode: ThemeMode;
  designPreset: DesignPreset;
  boardLayout: BoardLayout;
  dailyBriefingEnabled: boolean;
  showOverviewHeader: boolean;
  autoSyncDelaySeconds: number;
  searchQuery: string;
  dueFilter: DueFilter;

  // Active Focus Timer & Drag state
  activeFocusTaskId: string | null;
  focusRemainingSeconds: number;
  isDragging: boolean;

  // Actions
  setIsDragging: (dragging: boolean) => void;
  setAutoSyncDelaySeconds: (seconds: number) => Promise<void>;
  scheduleSync: (delayMs?: number) => void;
  loadAll: () => Promise<void>;
  syncWithGoogle: () => Promise<void>;
  resetAndSync: () => Promise<void>;
  addTaskList: (title: string) => Promise<void>;
  renameTaskList: (id: string, title: string) => Promise<void>;
  toggleTaskListVisibility: (id: string, isVisible: boolean) => Promise<void>;
  setTaskListColor: (id: string, color: string) => Promise<void>;
  reorderTaskLists: (orderedIds: string[]) => Promise<void>;
  removeTaskList: (id: string) => Promise<void>;
  addTask: (
    listId: string,
    title: string,
    notes?: string,
    due?: string | null,
    priority?: TaskPriority
  ) => Promise<void>;
  updateTask: (
    id: string,
    updates: Partial<
      Pick<Task, 'title' | 'notes' | 'status' | 'due' | 'priority' | 'reminderAt'>
    >
  ) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  moveTask: (
    taskId: string,
    fromListId: string,
    toListId: string,
    toIndex: number
  ) => Promise<void>;
  reorderInList: (listId: string, orderedIds: string[]) => Promise<void>;
  setShowCompletedByDefault: (val: boolean) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setDesignPreset: (preset: DesignPreset) => Promise<void>;
  setBoardLayout: (layout: BoardLayout) => Promise<void>;
  setDailyBriefingEnabled: (enabled: boolean) => Promise<void>;
  setShowOverviewHeader: (show: boolean) => Promise<void>;
  setSearchQuery: (q: string) => void;
  setDueFilter: (f: DueFilter) => void;
  startFocusTimer: (taskId: string, minutes?: number) => void;
  tickFocusTimer: () => void;
  stopFocusTimer: () => void;
}

const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Done'];
let syncQueued = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

export const useKanbanStore = create<KanbanState>((set, get) => ({
  taskLists: [],
  tasksByList: {},
  isLoading: false,
  syncState: 'idle',
  lastSyncedAt: null,
  error: null,
  showCompletedByDefault: false,
  themeMode: 'system',
  designPreset: 'apple',
  boardLayout: 'horizontal',
  dailyBriefingEnabled: true,
  showOverviewHeader: true,
  autoSyncDelaySeconds: 60,
  searchQuery: '',
  dueFilter: 'all',
  activeFocusTaskId: null,
  focusRemainingSeconds: 0,
  isDragging: false,

  setIsDragging: (dragging: boolean) => {
    set({ isDragging: dragging });
    if (!dragging && syncQueued) {
      get().scheduleSync();
    }
  },

  setAutoSyncDelaySeconds: async (seconds: number) => {
    await setSetting('autoSyncDelaySeconds', String(seconds));
    set({ autoSyncDelaySeconds: seconds });
    Haptics.selectionAsync().catch(() => {});
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    if (seconds > 0 && syncQueued) {
      get().scheduleSync(seconds * 1000);
    }
  },

  scheduleSync: (delayMs?: number) => {
    syncQueued = true;
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    const configuredSec = get().autoSyncDelaySeconds;
    if (configuredSec <= 0 && delayMs === undefined) {
      // Manual sync only
      return;
    }
    const waitMs = delayMs ?? configuredSec * 1000;
    syncTimer = setTimeout(() => {
      syncTimer = null;
      if (get().isDragging) {
        // Still dragging; wait until setIsDragging(false)
        return;
      }
      get().syncWithGoogle();
    }, waitMs);
  },

  loadAll: async () => {
    set({ isLoading: get().taskLists.length === 0, error: null });
    try {
      const [
        showCompStr,
        themeStr,
        presetStr,
        layoutStr,
        briefingStr,
        overviewStr,
        syncDelayStr,
      ] = await Promise.all([
        getSetting('showCompletedByDefault', 'false'),
        getSetting('themeMode', 'system'),
        getSetting('designPreset', 'apple'),
        getSetting('boardLayout', 'horizontal'),
        getSetting('dailyBriefingEnabled', 'true'),
        getSetting('showOverviewHeader', 'true'),
        getSetting('autoSyncDelaySeconds', '60'),
      ]);

      const listsBefore = await taskListRepo.getAllTaskLists();
      const isDefaultOnly =
        listsBefore.length === 3 &&
        listsBefore.every((l) => !l.remoteId && DEFAULT_COLUMNS.includes(l.title));
      if (isDefaultOnly) {
        await taskListRepo.clearUnsyncedEmptyLists();
      }

      const lists = await taskListRepo.getAllTaskLists();
      const tasksByList: Record<string, Task[]> = {};
      let openCount = 0;
      for (const list of lists) {
        const listTasks = await taskRepo.getTasksByListId(list.id);
        tasksByList[list.id] = listTasks;
        openCount += listTasks.filter((t) => t.status === 'needsAction').length;
      }

      const briefingEnabled = briefingStr === 'true';
      const parsedDelay = parseInt(syncDelayStr, 10);
      set({
        taskLists: lists,
        tasksByList,
        showCompletedByDefault: showCompStr === 'true',
        themeMode: (themeStr as ThemeMode) || 'system',
        designPreset: (presetStr as DesignPreset) || 'apple',
        boardLayout: (layoutStr as BoardLayout) || 'horizontal',
        dailyBriefingEnabled: briefingEnabled,
        showOverviewHeader: overviewStr === 'true',
        autoSyncDelaySeconds: Number.isFinite(parsedDelay) ? parsedDelay : 60,
        isLoading: false,
      });

      updateDailyBriefingNotification(briefingEnabled, openCount).catch(() => {});
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  syncWithGoogle: async () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    if (get().isDragging || get().syncState === 'syncing') {
      syncQueued = true;
      return;
    }

    const token = await getValidAccessToken();
    if (!token) return;

    syncQueued = false;
    set({ syncState: 'syncing', error: null });
    try {
      let lastResult = await runSync();
      while (syncQueued && !get().isDragging) {
        syncQueued = false;
        lastResult = await runSync();
      }

      if (!get().isDragging) {
        await get().loadAll();
      }

      if (lastResult.errors.length > 0) {
        set({
          syncState: 'error',
          error: `Sync-Warnung: ${lastResult.errors[0]}`,
        });
      } else {
        set({
          syncState: 'idle',
          lastSyncedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      syncQueued = false;
      set({
        syncState: 'error',
        error: (error as Error).message,
      });
    }
  },

  resetAndSync: async () => {
    set({ isLoading: true, error: null });
    try {
      await taskListRepo.resetLocalDatabase();
      await get().loadAll();
      await get().syncWithGoogle();
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  addTaskList: async (title: string) => {
    try {
      const newList = await taskListRepo.createTaskList(title);
      set((state) => ({
        taskLists: [...state.taskLists, newList],
        tasksByList: { ...state.tasksByList, [newList.id]: [] },
      }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
      get().scheduleSync();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  renameTaskList: async (id: string, title: string) => {
    try {
      await taskListRepo.updateTaskList(id, title);
      set((state) => ({
        taskLists: state.taskLists.map((list) =>
          list.id === id
            ? { ...list, title, syncStatus: 'pending' as const }
            : list
        ),
      }));
      get().scheduleSync();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  toggleTaskListVisibility: async (id: string, isVisible: boolean) => {
    try {
      await taskListRepo.setTaskListVisibility(id, isVisible);
      set((state) => ({
        taskLists: state.taskLists.map((list) =>
          list.id === id ? { ...list, isVisible } : list
        ),
      }));
      Haptics.selectionAsync().catch(() => {});
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  setTaskListColor: async (id: string, color: string) => {
    try {
      await taskListRepo.setTaskListColor(id, color);
      set((state) => ({
        taskLists: state.taskLists.map((list) =>
          list.id === id ? { ...list, color } : list
        ),
      }));
      Haptics.selectionAsync().catch(() => {});
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  reorderTaskLists: async (orderedIds: string[]) => {
    try {
      set((state) => {
        const byId = new Map(state.taskLists.map((l) => [l.id, l]));
        const reordered: TaskList[] = [];
        orderedIds.forEach((id, idx) => {
          const item = byId.get(id);
          if (item) reordered.push({ ...item, position: idx });
        });
        state.taskLists.forEach((l) => {
          if (!orderedIds.includes(l.id)) {
            reordered.push({ ...l, position: reordered.length });
          }
        });
        return { taskLists: reordered };
      });
      await taskListRepo.reorderTaskLists(get().taskLists.map((l) => l.id));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  removeTaskList: async (id: string) => {
    try {
      await taskListRepo.deleteTaskList(id);
      set((state) => {
        const { [id]: _, ...remainingTasks } = state.tasksByList;
        return {
          taskLists: state.taskLists.filter((list) => list.id !== id),
          tasksByList: remainingTasks,
        };
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => {}
      );
      get().scheduleSync();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  addTask: async (
    listId: string,
    title: string,
    notes: string = '',
    due: string | null = null,
    priority: TaskPriority = 'none'
  ) => {
    try {
      const newTask = await taskRepo.createTask(
        listId,
        title,
        notes,
        due,
        priority,
        null
      );
      set((state) => ({
        tasksByList: {
          ...state.tasksByList,
          [listId]: [...(state.tasksByList[listId] || []), newTask],
        },
      }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      get().scheduleSync();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  updateTask: async (id: string, updates) => {
    try {
      await taskRepo.updateTask(id, updates);

      let updatedTaskObj: Task | null = null;
      let listTitle = 'Erinnerung';

      set((state) => {
        const newTasksByList = { ...state.tasksByList };
        for (const listId of Object.keys(newTasksByList)) {
          newTasksByList[listId] = newTasksByList[listId].map((task) => {
            if (task.id === id) {
              const merged = {
                ...task,
                ...updates,
                syncStatus: 'pending' as const,
              };
              updatedTaskObj = merged;
              const l = state.taskLists.find((item) => item.id === listId);
              if (l) listTitle = l.title;
              return merged;
            }
            return task;
          });
        }
        return { tasksByList: newTasksByList };
      });

      if (updates.reminderAt !== undefined && updatedTaskObj) {
        const t = updatedTaskObj as Task;
        if (updates.reminderAt) {
          await scheduleTaskReminder(
            t.id,
            t.title,
            listTitle,
            new Date(updates.reminderAt)
          );
        } else {
          await cancelTaskReminder(t.id);
        }
      }

      get().scheduleSync();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  removeTask: async (id: string) => {
    try {
      await taskRepo.deleteTask(id);
      await cancelTaskReminder(id);
      set((state) => {
        const newTasksByList = { ...state.tasksByList };
        for (const listId of Object.keys(newTasksByList)) {
          newTasksByList[listId] = newTasksByList[listId].filter(
            (task) => task.id !== id
          );
        }
        return { tasksByList: newTasksByList };
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
      get().scheduleSync();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  toggleTask: async (id: string) => {
    try {
      const newStatus = await taskRepo.toggleTaskStatus(id);
      if (newStatus === 'completed') {
        await cancelTaskReminder(id);
      }
      set((state) => {
        const newTasksByList = { ...state.tasksByList };
        for (const listId of Object.keys(newTasksByList)) {
          newTasksByList[listId] = newTasksByList[listId].map((task) =>
            task.id === id
              ? { ...task, status: newStatus, syncStatus: 'pending' as const }
              : task
          );
        }
        return { tasksByList: newTasksByList };
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      get().scheduleSync();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  moveTask: async (
    taskId: string,
    fromListId: string,
    toListId: string,
    toIndex: number
  ) => {
    try {
      set((state) => {
        const newTasksByList = { ...state.tasksByList };
        const fromTasks = [...(newTasksByList[fromListId] || [])];
        const taskIndex = fromTasks.findIndex((t) => t.id === taskId);
        if (taskIndex === -1) return state;

        const [movedTask] = fromTasks.splice(taskIndex, 1);
        const updatedTask = {
          ...movedTask,
          listId: toListId,
          syncStatus: 'pending' as const,
        };

        if (fromListId === toListId) {
          fromTasks.splice(toIndex, 0, updatedTask);
          newTasksByList[fromListId] = fromTasks;
        } else {
          newTasksByList[fromListId] = fromTasks;
          const toTasks = [...(newTasksByList[toListId] || [])];
          toTasks.splice(toIndex, 0, updatedTask);
          newTasksByList[toListId] = toTasks;
        }

        return { tasksByList: newTasksByList };
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await taskRepo.moveTask(taskId, toListId, toIndex);
      get().scheduleSync();
    } catch (error) {
      set({ error: (error as Error).message });
      get().loadAll();
    }
  },

  reorderInList: async (listId: string, orderedIds: string[]) => {
    try {
      await taskRepo.reorderTasksInList(listId, orderedIds);
      const tasks = await taskRepo.getTasksByListId(listId);
      set((state) => ({
        tasksByList: { ...state.tasksByList, [listId]: tasks },
      }));
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  setShowCompletedByDefault: async (val: boolean) => {
    await setSetting('showCompletedByDefault', val ? 'true' : 'false');
    set({ showCompletedByDefault: val });
  },

  setThemeMode: async (mode: ThemeMode) => {
    await setSetting('themeMode', mode);
    set({ themeMode: mode });
  },

  setDesignPreset: async (preset: DesignPreset) => {
    await setSetting('designPreset', preset);
    set({ designPreset: preset });
    Haptics.selectionAsync().catch(() => {});
  },

  setBoardLayout: async (layout: BoardLayout) => {
    await setSetting('boardLayout', layout);
    set({ boardLayout: layout });
    Haptics.selectionAsync().catch(() => {});
  },

  setDailyBriefingEnabled: async (enabled: boolean) => {
    await setSetting('dailyBriefingEnabled', enabled ? 'true' : 'false');
    set({ dailyBriefingEnabled: enabled });
    let openCount = 0;
    const { tasksByList } = get();
    for (const k of Object.keys(tasksByList)) {
      openCount += (tasksByList[k] || []).filter(
        (t) => t.status === 'needsAction'
      ).length;
    }
    await updateDailyBriefingNotification(enabled, openCount);
  },

  setShowOverviewHeader: async (show: boolean) => {
    await setSetting('showOverviewHeader', show ? 'true' : 'false');
    set({ showOverviewHeader: show });
  },

  setSearchQuery: (q: string) => set({ searchQuery: q }),
  setDueFilter: (f: DueFilter) => set({ dueFilter: f }),

  startFocusTimer: (taskId: string, minutes: number = 25) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    set({
      activeFocusTaskId: taskId,
      focusRemainingSeconds: minutes * 60,
    });
  },

  tickFocusTimer: () => {
    const { focusRemainingSeconds, activeFocusTaskId } = get();
    if (!activeFocusTaskId) return;
    if (focusRemainingSeconds <= 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {}
      );
      set({ activeFocusTaskId: null, focusRemainingSeconds: 0 });
    } else {
      set({ focusRemainingSeconds: focusRemainingSeconds - 1 });
    }
  },

  stopFocusTimer: () => {
    set({ activeFocusTaskId: null, focusRemainingSeconds: 0 });
  },
}));
