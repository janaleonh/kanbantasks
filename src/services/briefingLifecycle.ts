import { AppState } from 'react-native';
import { useKanbanStore } from '../stores/useKanbanStore';
import { useCalendarStore } from '../stores/useCalendarStore';
import { usePrivacyStore } from '../stores/usePrivacyStore';
import { briefingDates } from './briefing';
import { monthKey } from '../calendar/dates';
import { scheduleBriefings } from './briefingScheduler';
import * as Notifications from 'expo-notifications';
import { buildBriefing, type BriefingSnapshot } from './briefing';
import { requestNotificationPermissions } from './notificationPermissions';
import { notificationText } from '../security/privacy';

function snapshot(): BriefingSnapshot {
  const tasks = useKanbanStore.getState(), calendar = useCalendarStore.getState();
  return { enabled: tasks.dailyBriefingEnabled, lists: tasks.taskLists, tasksByList: tasks.tasksByList,
    selectedCalendarIds: calendar.account ? calendar.selectedIds : [], eventsByMonth: calendar.account ? calendar.eventsByMonth : {}, calendarError: !!calendar.error, capturedAt: new Date() };
}

export async function sendBriefingPreview() {
  if (!await requestNotificationPermissions()) return false;
  const content = buildBriefing(snapshot(), new Date());
  await Notifications.scheduleNotificationAsync({ identifier: 'briefing-preview', content: {
    ...await notificationText(content.title, content.body), sound: 'default', threadIdentifier: 'planner-daily', data: { kind: 'daily-briefing', url: 'kanban-tasks:///' },
  }, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 } });
  return true;
}

export function startDailyBriefings() {
  let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    if (stopped) return;
    const tasks = useKanbanStore.getState();
    if (!tasks.hasLoaded) return;
    void scheduleBriefings(snapshot()).catch(() => {});
  };
  const queue = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
  const loadCalendar = (force = false) => {
    const calendar = useCalendarStore.getState();
    if (!calendar.account || !calendar.initialized || !calendar.selectedIds.length) return;
    const dates = [...new Map(briefingDates().map(date => [monthKey(date), date])).values()];
    for (const date of dates) void calendar.loadMonth(date, force);
  };
  const tasks = useKanbanStore.subscribe((state, previous) => {
    if (state.taskLists !== previous.taskLists || state.tasksByList !== previous.tasksByList || state.dailyBriefingEnabled !== previous.dailyBriefingEnabled || state.hasLoaded !== previous.hasLoaded) queue();
  });
  const calendar = useCalendarStore.subscribe((state, previous) => {
    if (state.account !== previous.account || state.selectedIds !== previous.selectedIds || state.calendars !== previous.calendars || state.initialized !== previous.initialized) loadCalendar();
    if (state.account !== previous.account || state.selectedIds !== previous.selectedIds || state.eventsByMonth !== previous.eventsByMonth || state.error !== previous.error) queue();
  });
  const privacy = usePrivacyStore.subscribe((state, previous) => { if (state.hideNotificationText !== previous.hideNotificationText || state.initialized !== previous.initialized) queue(); });
  const app = AppState.addEventListener('change', state => { if (state === 'active') { loadCalendar(true); queue(); } });
  const periodic = setInterval(() => { if (AppState.currentState === 'active') { loadCalendar(true); queue(); } }, 5 * 60 * 1000);
  loadCalendar(); queue();
  return () => { stopped = true; clearTimeout(timer); clearInterval(periodic); tasks(); calendar(); privacy(); app.remove(); };
}
