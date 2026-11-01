import { create } from 'zustand';
import { loadCachedUser } from '../auth/googleAuth';
import { getSetting, setSetting } from '../db/database';
import { CalendarApiError, fetchCalendarMonth, fetchCalendars } from '../calendar/googleCalendarApi';
import { dayKey, monthKey } from '../calendar/dates';
import type { CalendarEvent, GoogleCalendar } from '../calendar/types';

interface CalendarState {
  account: string | null;
  initialized: boolean;
  calendars: GoogleCalendar[];
  selectedIds: string[];
  eventsByMonth: Record<string, CalendarEvent[]>;
  loadingCalendars: boolean;
  loadingMonths: string[];
  error: string | null;
  needsReconnect: boolean;
  todayKey: string;
  initialize: () => Promise<void>;
  connectAccount: (email: string) => Promise<void>;
  disconnect: () => void;
  refreshCalendars: () => Promise<void>;
  selectCalendars: (ids: string[]) => Promise<void>;
  loadMonth: (date: Date, force?: boolean) => Promise<void>;
  updateDay: () => void;
  refreshAfterMutation: (dates?: Date[]) => Promise<void>;
}

let accountVersion = 0;
let selectionVersion = 0;
let initializing: Promise<void> | null = null;
let writes: Promise<void> = Promise.resolve();
const eventRequests = new Map<string, Promise<void>>();
const selectionKey = (email: string) => `googleCalendarSelection:${email}`;
const errorState = (error: unknown) => ({
  error: error instanceof CalendarApiError ? error.message : 'Kalender konnten nicht aktualisiert werden. Prüfe deine Internetverbindung.',
  needsReconnect: error instanceof CalendarApiError && error.reconnect,
});

export const useCalendarStore = create<CalendarState>((set, get) => ({
  account: null, initialized: false, calendars: [], selectedIds: [], eventsByMonth: {},
  loadingCalendars: false, loadingMonths: [], error: null, needsReconnect: false, todayKey: dayKey(new Date()),

  initialize: async () => {
    if (get().initialized) return;
    if (initializing) return initializing;
    const version = accountVersion;
    initializing = (async () => {
      try {
        const user = await loadCachedUser();
        if (version !== accountVersion) return;
        if (user) await get().connectAccount(user.email);
        else set({ initialized: true });
      } catch (error) { if (version === accountVersion) set({ initialized: true, ...errorState(error) }); }
    })().finally(() => { initializing = null; });
    return initializing;
  },

  connectAccount: async (email) => {
    if (get().account === email && get().initialized) { await get().refreshCalendars(); return; }
    const version = ++accountVersion;
    selectionVersion++;
    set({ account: email, initialized: false, calendars: [], selectedIds: [], eventsByMonth: {}, loadingMonths: [], loadingCalendars: false, error: null, needsReconnect: false });
    try {
      const saved: unknown = JSON.parse(await getSetting(selectionKey(email), '[]'));
      if (version !== accountVersion) return;
      const selectedIds = Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
      set({ selectedIds, initialized: true });
      await get().refreshCalendars();
    } catch (error) { if (version === accountVersion) set({ initialized: true, ...errorState(error) }); }
  },

  disconnect: () => {
    accountVersion++;
    selectionVersion++;
    set({ account: null, initialized: true, calendars: [], selectedIds: [], eventsByMonth: {}, loadingMonths: [], loadingCalendars: false, error: null, needsReconnect: false });
  },

  refreshCalendars: async () => {
    if (!get().account || get().loadingCalendars) return;
    const version = accountVersion;
    set({ loadingCalendars: true, error: null, needsReconnect: false });
    try {
      const calendars = await fetchCalendars();
      if (version !== accountVersion) return;
      set({ calendars, loadingCalendars: false });
      const selectedIds = get().selectedIds.filter((id) => calendars.some((calendar) => calendar.id === id));
      if (selectedIds.length !== get().selectedIds.length) await get().selectCalendars(selectedIds);
      else await get().loadMonth(new Date(), true);
    } catch (error) { if (version === accountVersion) set({ loadingCalendars: false, ...errorState(error) }); }
  },

  selectCalendars: async (ids) => {
    const account = get().account;
    if (!account) return;
    const version = accountVersion;
    const revision = ++selectionVersion;
    const selectedIds = [...new Set(ids)];
    set({ selectedIds, eventsByMonth: {}, loadingMonths: [], error: null, needsReconnect: false });
    // Serialize rapid toggle writes so a slower write cannot restore an old selection.
    writes = writes.catch(() => {}).then(() => setSetting(selectionKey(account), JSON.stringify(selectedIds)));
    try {
      await writes;
      if (version === accountVersion && revision === selectionVersion) await get().loadMonth(new Date(), true);
    } catch { if (version === accountVersion && revision === selectionVersion) set({ error: 'Kalenderauswahl konnte nicht gespeichert werden. Bitte wähle sie erneut aus.' }); }
  },

  loadMonth: async (date, force = false) => {
    if (!get().account || !get().selectedIds.length || !get().calendars.length) return;
    const key = monthKey(date);
    if (!force && get().eventsByMonth[key]) return;
    const version = accountVersion;
    const revision = selectionVersion;
    const requestKey = `${version}:${revision}:${key}`;
    const running = eventRequests.get(requestKey);
    if (running) return running;
    const calendars = get().calendars.filter((calendar) => get().selectedIds.includes(calendar.id));
    const request = (async () => {
      set({ loadingMonths: [...get().loadingMonths, key], error: null });
      const results = await Promise.allSettled(calendars.map((calendar) => fetchCalendarMonth(calendar, date)));
      if (version !== accountVersion || revision !== selectionVersion) return;
      const previous = get().eventsByMonth[key] || [];
      const events = results.flatMap((result, index) => result.status === 'fulfilled' ? result.value : previous.filter((event) => event.calendarId === calendars[index].id));
      const failure = results.find((result) => result.status === 'rejected');
      set({
        eventsByMonth: { ...get().eventsByMonth, [key]: events },
        loadingMonths: get().loadingMonths.filter((month) => month !== key),
        ...(failure?.status === 'rejected' ? errorState(failure.reason) : { needsReconnect: false }),
      });
    })().finally(() => { eventRequests.delete(requestKey); });
    eventRequests.set(requestKey, request);
    return request;
  },

  updateDay: () => { set({ todayKey: dayKey(new Date()) }); },

  refreshAfterMutation: async (dates = []) => {
    const keys = [...new Set([...Object.keys(get().eventsByMonth), monthKey(new Date()), ...dates.map(monthKey)])];
    // Invalidate reads started before the write; they must not restore stale events.
    selectionVersion++;
    set({ eventsByMonth: {}, loadingMonths: [], error: null });
    await Promise.all(keys.map((key) => get().loadMonth(new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1), true)));
  },
}));
