import { dayKey, localDate } from './dates';
import type { GoogleCalendarEvent } from './types';
import type { EventChanges } from './googleCalendarApi';

export type RepeatMode = 'keep' | 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export interface EventDraft {
  title: string; description: string; location: string;
  start: Date; end: Date; allDay: boolean; timeZone: string;
  repeat: RepeatMode; originalRecurrence: string[];
  interval: string; weekdays: string[]; monthlyMode: 'date' | 'weekday';
  repeatEnd: 'never' | 'on' | 'count'; until: Date; count: string;
  reminderMode: 'default' | 'none' | 'custom'; reminders: { method: 'popup' | 'email'; minutes: string }[];
  transparency: 'opaque' | 'transparent'; visibility: 'default' | 'public' | 'private' | 'confidential'; colorId: string;
}

export function canWriteCalendar(role?: string) { return role === 'owner' || role === 'writer'; }
export function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return !!value.trim(); } catch { return false; }
}

export function draftFromEvent(event?: GoogleCalendarEvent, initialDate = new Date(), zone?: string): EventDraft {
  const allDay = !!event?.start?.date && !event.start.dateTime;
  const timeZone = event?.start?.timeZone || zone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
  const start = event?.start?.dateTime ? new Date(event.start.dateTime) : event?.start?.date ? localDate(event.start.date) : wallClockInZone(initialDate, timeZone, 10, 0, 0);
  let end = event?.end?.dateTime ? new Date(event.end.dateTime) : event?.end?.date ? localDate(event.end.date) : new Date(start.getTime() + 3600000);
  if (allDay) { end = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1); }
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: allDay ? undefined : timeZone }).format(start).slice(0, 2).toUpperCase();
  return {
    title: event?.summary || '', description: event?.description || '', location: event?.location || '', start, end, allDay, timeZone,
    repeat: event?.recurrence?.length ? 'keep' : 'none', originalRecurrence: event?.recurrence || [], interval: '1', weekdays: [weekday], monthlyMode: 'date',
    repeatEnd: 'never', until: new Date(start.getFullYear(), start.getMonth() + 3, start.getDate()), count: '10',
    reminderMode: !event?.reminders || event.reminders.useDefault ? 'default' : event.reminders.overrides?.length ? 'custom' : 'none',
    reminders: (event?.reminders?.overrides || []).map((r) => ({ method: r.method, minutes: String(r.minutes) })),
    transparency: event?.transparency || 'opaque', visibility: event?.visibility || 'default', colorId: event?.colorId || '',
  };
}

// Convert a local wall-clock date to an instant in an IANA zone (including DST).
function wallClockInZone(date: Date, timeZone: string, hour: number, minute: number, second: number) {
  const wall = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, second);
  let instant = wall;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const observed = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    instant += wall - observed;
  }
  return new Date(instant);
}

export function toggleAllDay(draft: EventDraft, allDay: boolean): EventDraft {
  if (allDay === draft.allDay) return draft;
  if (allDay) {
    const localDay = (date: Date) => localDate(new Intl.DateTimeFormat('sv-SE', { timeZone: draft.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date));
    const start = localDay(draft.start);
    const end = localDay(new Date(draft.end.getTime() - 1));
    return { ...draft, allDay, start, end: end < start ? new Date(start) : end };
  }
  return { ...draft, allDay, start: wallClockInZone(draft.start, draft.timeZone, 10, 0, 0), end: wallClockInZone(draft.end, draft.timeZone, 11, 0, 0) };
}

export function changeDraftStart(draft: EventDraft, start: Date): EventDraft {
  if (!draft.allDay) return { ...draft, start, end: new Date(start.getTime() + Math.max(60000, draft.end.getTime() - draft.start.getTime())) };
  const ordinal = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  const days = Math.max(0, ordinal(draft.end) - ordinal(draft.start));
  return { ...draft, start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + days) };
}

export function buildEventChanges(draft: EventDraft, isInstance = false): EventChanges {
  if (!draft.title.trim()) throw new Error('Bitte gib einen Titel ein.');
  if (!validTimeZone(draft.timeZone)) throw new Error('Bitte gib eine gültige Zeitzone an, z. B. Europe/Berlin.');
  if (!Number.isFinite(draft.start.getTime()) || !Number.isFinite(draft.end.getTime())) throw new Error('Bitte prüfe Beginn und Ende.');
  if (draft.allDay ? dayKey(draft.end) < dayKey(draft.start) : draft.end <= draft.start) throw new Error('Das Ende muss nach dem Beginn liegen.');
  const changes: EventChanges = {
    summary: draft.title.trim(), description: draft.description, location: draft.location.trim(),
    start: draft.allDay ? { date: dayKey(draft.start) } : { dateTime: draft.start.toISOString(), timeZone: draft.timeZone },
    end: draft.allDay ? { date: dayKey(new Date(draft.end.getFullYear(), draft.end.getMonth(), draft.end.getDate() + 1)) } : { dateTime: draft.end.toISOString(), timeZone: draft.timeZone },
    transparency: draft.transparency, visibility: draft.visibility, colorId: draft.colorId || null,
    reminders: { useDefault: draft.reminderMode === 'default', ...(draft.reminderMode !== 'default' ? { overrides: draft.reminderMode === 'none' ? [] : draft.reminders.map((r) => ({ method: r.method, minutes: Number(r.minutes) })) } : {}) },
  };
  if (draft.reminderMode === 'custom' && (draft.reminders.length > 5 || draft.reminders.some((r) => !/^\d+$/.test(r.minutes) || Number(r.minutes) > 40320))) throw new Error('Erinnerungen müssen zwischen 0 und 40320 Minuten liegen (höchstens 5 Erinnerungen).');
  if (!isInstance) {
    if (draft.repeat === 'keep') changes.recurrence = draft.originalRecurrence;
    else if (draft.repeat === 'none') changes.recurrence = [];
    else {
      if (!/^\d+$/.test(draft.interval) || +draft.interval < 1 || +draft.interval > 999) throw new Error('Das Wiederholungsintervall muss zwischen 1 und 999 liegen.');
      const frequency = draft.repeat === 'weekdays' ? 'WEEKLY' : draft.repeat.toUpperCase();
      const rule = [`FREQ=${frequency}`, `INTERVAL=${draft.interval}`];
      if (draft.repeat === 'weekdays') rule.push('BYDAY=MO,TU,WE,TH,FR');
      if (draft.repeat === 'weekly') {
        const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].filter((d) => draft.weekdays.includes(d));
        if (!weekdays.length) throw new Error('Bitte wähle mindestens einen Wochentag.');
        rule.push(`BYDAY=${weekdays.join(',')}`);
      }
      if (draft.repeat === 'monthly' && draft.monthlyMode === 'weekday') {
        const parts = new Intl.DateTimeFormat('en', { timeZone: draft.allDay ? undefined : draft.timeZone, day: 'numeric', weekday: 'short' }).formatToParts(draft.start);
        const day = Number(parts.find((p) => p.type === 'day')?.value);
        const weekday = parts.find((p) => p.type === 'weekday')!.value.slice(0, 2).toUpperCase();
        rule.push(`BYDAY=${day > 28 ? -1 : Math.ceil(day / 7)}${weekday}`);
      }
      if (draft.repeatEnd === 'count') {
        if (!/^\d+$/.test(draft.count) || +draft.count < 1 || +draft.count > 9999) throw new Error('Die Anzahl muss zwischen 1 und 9999 liegen.');
        rule.push(`COUNT=${draft.count}`);
      }
      if (draft.repeatEnd === 'on') {
        const firstDay = draft.allDay ? dayKey(draft.start) : new Intl.DateTimeFormat('sv-SE', { timeZone: draft.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(draft.start);
        if (dayKey(draft.until) < firstDay) throw new Error('Das Serienende darf nicht vor dem Beginn liegen.');
        rule.push(`UNTIL=${draft.allDay ? dayKey(draft.until).replace(/-/g, '') : wallClockInZone(draft.until, draft.timeZone, 23, 59, 59).toISOString().replace(/[-:]/g, '').replace('.000', '')}`);
      }
      changes.recurrence = [`RRULE:${rule.join(';')}`];
    }
  }
  return changes;
}
