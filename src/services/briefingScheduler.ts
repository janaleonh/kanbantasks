import * as Notifications from 'expo-notifications';
import { notificationText } from '../security/privacy';
import { BRIEFING_PREFIX, briefingDates, buildBriefing, type BriefingSnapshot } from './briefing';
import { requestNotificationPermissions } from './notificationPermissions';
import { dayKey } from '../calendar/dates';
import { useBriefingStatus } from '../stores/useBriefingStatus';

let revision = 0;
let jobs: Promise<void> = Promise.resolve();
export function scheduleBriefings(snapshot: BriefingSnapshot) {
  const version = ++revision;
  const current = () => version === revision;
  jobs = jobs.catch(() => {}).then(async () => {
    if (!current()) return;
    // Replace the old repeating message: its captured count became stale forever.
    await Notifications.cancelScheduledNotificationAsync('daily-briefing');
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    if (!current()) return;
    const ours = pending.filter(request => request.identifier.startsWith(BRIEFING_PREFIX));
    if (!snapshot.enabled) {
      await Promise.all(ours.map(request => Notifications.cancelScheduledNotificationAsync(request.identifier)));
      if (current()) useBriefingStatus.setState({ message: 'Der tägliche Überblick ist ausgeschaltet.', count: 0, until: null, error: false });
      return;
    }
    if (!await requestNotificationPermissions()) {
      await Promise.all(ours.map(request => Notifications.cancelScheduledNotificationAsync(request.identifier)));
      if (current()) useBriefingStatus.setState({ message: 'Bitte erlaube Mitteilungen in den iPhone-Einstellungen und aktiviere dort „Sperrbildschirm“.', count: 0, until: null, error: true });
      return;
    }
    if (!current()) return;
    // Leave capacity for individual reminders and avoid the iOS pending limit.
    const available = Math.max(0, 60 - pending.filter(request => request.identifier !== 'daily-briefing' && !request.identifier.startsWith(BRIEFING_PREFIX)).length);
    const dates = briefingDates().slice(0, available);
    const desired = new Set(dates.map(date => `${BRIEFING_PREFIX}${dayKey(date)}`));
    for (const date of dates) {
      if (!current()) return;
      const content = buildBriefing(snapshot, date);
      const text = await notificationText(content.title, content.body);
      if (!current()) return;
      await Notifications.scheduleNotificationAsync({
        identifier: `${BRIEFING_PREFIX}${dayKey(date)}`,
        content: { ...text, sound: 'default', threadIdentifier: 'planner-daily', interruptionLevel: 'active', data: { kind: 'daily-briefing', day: dayKey(date), url: 'kanban-tasks:///' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
    }
    if (current()) for (const request of ours) if (!desired.has(request.identifier)) await Notifications.cancelScheduledNotificationAsync(request.identifier);
    if (current()) useBriefingStatus.setState({
      count: dates.length, until: dates.at(-1)?.toISOString() || null, error: !dates.length,
      message: dates.length ? `${dates.length} Tagesübersichten bis ${dates.at(-1)!.toLocaleDateString('de-DE')} für 08:30 Uhr vorbereitet.${dates.length < 14 ? ' Weitere Erinnerungen belegen den verfügbaren Platz.' : ''}` : 'Es sind zu viele einzelne Erinnerungen geplant. Für den täglichen Überblick ist derzeit kein Platz frei.',
    });
  }).catch(error => {
    if (current()) useBriefingStatus.setState({ message: 'Die Tagesübersicht konnte nicht geplant werden. Bitte öffne die App erneut und prüfe die Mitteilungsberechtigung.', error: true });
    throw error;
  });
  return jobs;
}
