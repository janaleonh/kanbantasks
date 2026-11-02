import { dayKey, eventsForDay, monthKey } from '../calendar/dates';
import type { CalendarEvent } from '../calendar/types';
import type { Task } from '../db/taskRepo';
import type { TaskList } from '../db/taskListRepo';

export const BRIEFING_PREFIX = 'daily-briefing-';
export const BRIEFING_DAYS = 14;
export type BriefingSnapshot = {
  enabled: boolean; lists: TaskList[]; tasksByList: Record<string, Task[]>;
  selectedCalendarIds: string[]; eventsByMonth: Record<string, CalendarEvent[]>;
  calendarError: boolean; capturedAt: Date;
};
const clean = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 90);

export function briefingDates(now = new Date()) {
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 30);
  if (first <= now) first.setDate(first.getDate() + 1);
  return Array.from({ length: BRIEFING_DAYS }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i, 8, 30));
}

export function buildBriefing(snapshot: BriefingSnapshot, date: Date) {
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const open = snapshot.lists.filter(list => list.isVisible && !list.deletedLocally).flatMap(list => snapshot.tasksByList[list.id] || [])
    .filter(task => task.status === 'needsAction' && !task.deletedLocally);
  const dueTime = (task: Task) => task.due && Number.isFinite(new Date(task.due).getTime()) ? new Date(task.due).getTime() : Infinity;
  const due = open.filter(task => dueTime(task) < end).sort((a, b) => dueTime(a) - dueTime(b) || a.localPosition - b.localPosition);
  const shownTasks = [...due, ...open.filter(task => !task.due)].slice(0, 4);
  const lines = [`${open.length} offene ${open.length === 1 ? 'Aufgabe' : 'Aufgaben'} · ${due.length} heute fällig/überfällig`];
  lines.push(...shownTasks.map(task => `• ${clean(task.title)}`));
  const events = eventsForDay([...new Map(Object.values(snapshot.eventsByMonth).flat().map(event => [event.id, event])).values()], date, snapshot.selectedCalendarIds);
  const calendarLoaded = !!snapshot.eventsByMonth[monthKey(date)];
  if (snapshot.selectedCalendarIds.length) {
    if (!calendarLoaded) lines.push('Kalender noch nicht geladen · App zum Aktualisieren öffnen');
    else {
      lines.push(`${events.length} ${events.length === 1 ? 'Termin' : 'Termine'}`);
      for (const event of events.slice(0, 4)) {
        const start = new Date(event.start);
        const time = event.allDay ? 'Ganztägig' : dayKey(start) < dayKey(date) ? 'Läuft bereits' : start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        lines.push(`${time} · ${clean(event.title)}`);
      }
      if (events.length > 4) lines.push(`+ ${events.length - 4} weitere Termine`);
      if (snapshot.calendarError) lines.push('Kalenderstand möglicherweise unvollständig');
    }
  }
  const stamp = snapshot.capturedAt.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  lines.push(`Stand ${stamp} · Änderungen nach diesem Stand sind noch nicht enthalten.`);
  return { title: `Planner · ${date.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}`, body: lines.join('\n'), taskCount: open.length, eventCount: events.length };
}
