import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { notificationText } from '../security/privacy';
import { getTaskById } from '../db/taskRepo';
import { requestNotificationPermissions } from './notificationPermissions';
import { BRIEFING_PREFIX } from './briefing';
export { requestNotificationPermissions } from './notificationPermissions';

// Configure foreground notification presentation on iOS
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function scheduleTaskReminder(
  taskId: string,
  taskTitle: string,
  listTitle: string,
  triggerDate: Date
): Promise<string | null> {
  const granted = await requestNotificationPermissions();
  if (!granted) return null;

  const secondsFromNow = Math.max(
    5,
    Math.floor((triggerDate.getTime() - Date.now()) / 1000)
  );

  try {
    // Cancel any existing reminder for this task
    await cancelTaskReminder(taskId);

    const id = await Notifications.scheduleNotificationAsync({
      identifier: `task-${taskId}`,
      content: {
        ...await notificationText(listTitle || 'Aufgabe fällig', taskTitle),
        sound: 'default',
        data: { taskId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsFromNow,
      },
    });
    return id;
  } catch {
    return null;
  }
}

export async function cancelTaskReminder(taskId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(`task-${taskId}`);
  } catch {
    // Ignore if not scheduled
  }
}

export async function scheduleFocusTimerNotification(
  taskTitle: string,
  durationSeconds: number
): Promise<void> {
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  try {
    await Notifications.cancelScheduledNotificationAsync('focus-timer');
    await Notifications.scheduleNotificationAsync({
      identifier: 'focus-timer',
      content: {
        data: { plannerExpiresAt: Date.now() + Math.max(1, durationSeconds) * 1000 },
        ...await notificationText('Fokus-Session abgeschlossen', `"${taskTitle}" – Zeit für eine kurze Pause.`),
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, durationSeconds),
      },
    });
  } catch {
    // Ignore errors in unsupported environments
  }
}

export async function cancelFocusTimerNotification(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync('focus-timer');
  } catch {
    // Ignore
  }
}

export async function redactExistingNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (request.identifier === 'briefing-preview') { await Notifications.cancelScheduledNotificationAsync(request.identifier); continue; }
    if (!request.identifier.startsWith('task-') && !request.identifier.startsWith(BRIEFING_PREFIX) && !['focus-timer', 'daily-briefing'].includes(request.identifier)) continue;
    let trigger: Notifications.NotificationTriggerInput;
    if (request.identifier.startsWith('task-')) {
      const task = await getTaskById(request.identifier.slice(5));
      if (!task?.reminderAt || task.deletedLocally || task.status === 'completed' || !Number.isFinite(new Date(task.reminderAt).getTime()) || new Date(task.reminderAt) <= new Date()) { await Notifications.cancelScheduledNotificationAsync(request.identifier); continue; }
      trigger = { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(task.reminderAt) };
    } else if (request.identifier.startsWith(BRIEFING_PREFIX)) {
      const day = request.identifier.slice(BRIEFING_PREFIX.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { await Notifications.cancelScheduledNotificationAsync(request.identifier); continue; }
      const [year, month, date] = day.split('-').map(Number);
      const fire = new Date(year, month - 1, date, 8, 30);
      if (fire <= new Date()) { await Notifications.cancelScheduledNotificationAsync(request.identifier); continue; }
      trigger = { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire };
    } else if (request.identifier === 'daily-briefing') trigger = { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 8, minute: 30 };
    else {
      const end = Number(request.content.data?.plannerExpiresAt);
      if (!Number.isFinite(end) || end <= Date.now()) { await Notifications.cancelScheduledNotificationAsync(request.identifier); continue; }
      trigger = { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(end) };
    }
    await Notifications.scheduleNotificationAsync({ identifier: request.identifier, content: { ...await notificationText('', ''), sound: 'default', data: request.content.data }, trigger });
  }
  await Notifications.dismissAllNotificationsAsync();
}

export async function sendTestNotification(): Promise<boolean> {
  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Mitteilungen aktiv',
        body: 'Erinnerungen für deine Aufgaben und Fokus-Timer funktionieren auf diesem iPhone.',
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
      },
    });
    return true;
  } catch {
    return false;
  }
}
