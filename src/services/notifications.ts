import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

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
        title: listTitle || 'Aufgabe fällig',
        body: taskTitle,
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
        title: 'Fokus-Session abgeschlossen',
        body: `"${taskTitle}" – Zeit für eine kurze Pause.`,
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

export async function updateDailyBriefingNotification(
  enabled: boolean,
  openTaskCount: number
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync('daily-briefing');
    if (!enabled) return;

    const granted = await requestNotificationPermissions();
    if (!granted) return;

    await Notifications.scheduleNotificationAsync({
      identifier: 'daily-briefing',
      content: {
        title: 'Tagesüberblick',
        body:
          openTaskCount > 0
            ? `Du hast aktuell ${openTaskCount} offene Aufgaben in deinem Board.`
            : 'Dein Board ist aufgeräumt – starte entspannt in den Tag.',
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 8,
        minute: 30,
      },
    });
  } catch {
    // Ignore
  }
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
