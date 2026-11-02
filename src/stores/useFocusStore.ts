import { create } from 'zustand';
import { getSetting, setSetting } from '../db/database';
import { getTaskById } from '../db/taskRepo';
import { cancelFocusTimerNotification, scheduleFocusTimerNotification } from '../services/notifications';
import { parseFocus, remainingFocus, type FocusSession } from '../tasks/focus';

interface FocusState {
  initialized: boolean; busy: boolean; session: FocusSession | null; error: string | null;
  initialize: () => Promise<void>; start: (taskId: string, minutes: number) => Promise<void>;
  pause: () => Promise<void>; resume: () => Promise<void>; end: () => Promise<void>;
}
let initializing: Promise<void> | null = null;
const persist = (session: FocusSession | null) => setSetting('focusSession', JSON.stringify(session));
export const useFocusStore = create<FocusState>((set, get) => ({
  initialized: false, busy: false, session: null, error: null,
  initialize: async () => {
    if (get().initialized) return;
    if (initializing) return initializing;
    initializing = getSetting('focusSession', 'null').then(parseFocus).then(session => { set({ session, initialized: true }); }).catch(() => { set({ initialized: true, error: 'Die vorherige Fokus-Sitzung konnte nicht geladen werden.' }); }).finally(() => { initializing = null; });
    return initializing;
  },
  start: async (taskId, minutes) => {
    await get().initialize();
    if (get().busy) return;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 180) throw new Error('Wähle eine Dauer zwischen 0 und 180 Minuten.');
    set({ busy: true, error: null });
    try {
      const task = await getTaskById(taskId);
      if (!task || task.deletedLocally || task.status !== 'needsAction') throw new Error('Wähle eine offene Aufgabe.');
      const duration = minutes * 60;
      const session: FocusSession = { taskId, title: task.title, duration, startedAt: Date.now(), endAt: duration ? Date.now() + duration * 1000 : null, paused: null };
      await persist(session); set({ session }); await cancelFocusTimerNotification();
      if (duration) await scheduleFocusTimerNotification(task.title, remainingFocus(session)!);
    } finally { set({ busy: false }); }
  },
  pause: async () => {
    const current = get().session;
    if (get().busy || !current?.duration || current.paused !== null) return;
    set({ busy: true });
    try { const session = { ...current, paused: remainingFocus(current), endAt: null }; await persist(session); set({ session }); await cancelFocusTimerNotification(); }
    finally { set({ busy: false }); }
  },
  resume: async () => {
    const current = get().session;
    if (get().busy || !current || current.paused === null || current.paused <= 0) return;
    set({ busy: true });
    try { const session = { ...current, endAt: Date.now() + current.paused * 1000, paused: null }; await persist(session); set({ session }); await scheduleFocusTimerNotification(session.title, remainingFocus(session)!); }
    finally { set({ busy: false }); }
  },
  end: async () => {
    if (get().busy) return;
    set({ busy: true });
    try { await persist(null); set({ session: null, error: null }); await cancelFocusTimerNotification(); }
    finally { set({ busy: false }); }
  },
}));
