import type { CalendarEvent, GoogleCalendar, GoogleCalendarEvent } from './types';
import { EVENT_COLORS } from './eventColors';

export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const monthKey = (date: Date) => dayKey(date).slice(0, 7);
export const localDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export function monthRange(date: Date) {
  return { start: new Date(date.getFullYear(), date.getMonth(), 1), end: new Date(date.getFullYear(), date.getMonth() + 1, 1) };
}

export function weekDays(date: Date) {
  const monday = date.getDate() - (date.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => new Date(date.getFullYear(), date.getMonth(), monday + i));
}

export function normalizeEvent(event: GoogleCalendarEvent, calendar: GoogleCalendar): CalendarEvent | null {
  if (event.status === 'cancelled' || event.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return null;
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  if (!start || !end) return null;
  const allDay = !event.start?.dateTime;
  if (!Number.isFinite((allDay ? localDate(start) : new Date(start)).getTime()) || !Number.isFinite((allDay ? localDate(end) : new Date(end)).getTime())) return null;
  return {
    id: `${calendar.id}:${event.id}`, eventId: event.id, calendarId: calendar.id,
    calendarTitle: calendar.summaryOverride || calendar.summary,
    color: EVENT_COLORS[Number(event.colorId)] || calendar.backgroundColor || '#007AFF', title: event.summary || 'Ohne Titel',
    location: event.location || '', url: event.htmlLink || null, start, end, allDay,
  };
}

export function eventsForDay(events: CalendarEvent[], date: Date, selectedIds?: string[]) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const timestamp = (event: CalendarEvent, field: 'start' | 'end') => (event.allDay ? localDate(event[field]) : new Date(event[field])).getTime();
  return events.filter((event) => {
    if (selectedIds && !selectedIds.includes(event.calendarId)) return false;
    const from = timestamp(event, 'start');
    const to = timestamp(event, 'end');
    return from < end && (to > start || (to === from && from >= start));
  }).sort((a, b) => Number(b.allDay) - Number(a.allDay) || timestamp(a, 'start') - timestamp(b, 'start') || a.id.localeCompare(b.id));
}

export function eventTimeLabel(event: CalendarEvent) {
  if (event.allDay) return 'Ganztägig';
  const format = (value: string) => new Date(value).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const crossesDay = dayKey(new Date(event.start)) !== dayKey(new Date(event.end));
  return crossesDay
    ? `${new Date(event.start).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${format(event.start)} – ${new Date(event.end).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${format(event.end)}`
    : `${format(event.start)} – ${format(event.end)}`;
}
