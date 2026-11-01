import { getValidAccessToken, getAuthVersion } from '../auth/googleAuth';
import { monthRange, normalizeEvent } from './dates';
import type { CalendarEvent, GoogleCalendar, GoogleCalendarEvent } from './types';

export class CalendarApiError extends Error {
  constructor(message: string, public reconnect = false, public status?: number) { super(message); }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const version = getAuthVersion();
  const token = await getValidAccessToken();
  if (!token) throw new CalendarApiError('Bitte melde dich erneut bei Google an, um Kalender zu laden.', true);
  if (version !== getAuthVersion()) throw new CalendarApiError('Die Google-Anmeldung wurde geändert. Bitte öffne den Kalender erneut.', true);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, signal: controller.signal,
    });
    if (version !== getAuthVersion()) throw new CalendarApiError('Die Google-Anmeldung wurde geändert. Bitte öffne den Kalender erneut.', true);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const reasons: string[] = (body.error?.errors || []).map((error: { reason?: string }) => error.reason || '');
      if (response.status === 401 || reasons.includes('insufficientPermissions')) throw new CalendarApiError('Bitte verbinde Google Kalender erneut und erlaube den Terminzugriff einschließlich Bearbeiten.', true, response.status);
      if (reasons.includes('accessNotConfigured') || reasons.includes('serviceDisabled')) throw new CalendarApiError('Die Google Calendar API muss für dieses Google-Cloud-Projekt aktiviert werden.');
      if (reasons.includes('forbiddenForNonOrganizer')) throw new CalendarApiError('Diese Änderung darf nur der Organisator des Termins vornehmen.', false, response.status);
      if (response.status === 403) throw new CalendarApiError('Kein Schreib- oder Kalenderzugriff. Prüfe deine Google-Berechtigung und die Zugriffsrechte des Kalenders.', true, response.status);
      if (response.status === 412) throw new CalendarApiError('Der Termin wurde inzwischen geändert. Bitte lade ihn neu, bevor du deine Änderungen erneut speicherst.', false, 412);
      if (response.status === 409) throw new CalendarApiError('Dieser Termin wurde bereits gespeichert.', false, 409);
      if (response.status === 410) throw new CalendarApiError('Dieser Termin wurde bereits gelöscht.', false, 410);
      if (response.status === 404) throw new CalendarApiError('Der Kalender oder Termin ist nicht mehr verfügbar. Bitte aktualisiere die Kalenderansicht.', false, 404);
      throw new CalendarApiError(`Die Kalenderaktion ist fehlgeschlagen (${response.status}). Bitte prüfe die Angaben und versuche es erneut.`, false, response.status);
    }
    if (response.status === 204) return undefined as T;
    const data = await response.json();
    if (version !== getAuthVersion()) throw new CalendarApiError('Die Google-Anmeldung wurde geändert. Bitte öffne den Kalender erneut.', true);
    return data;
  } finally { clearTimeout(timeout); }
}

async function paginate<T>(path: string, parameters: Record<string, string>): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ ...parameters, ...(pageToken ? { pageToken } : {}) });
    const data = await request<{ items?: T[]; nextPageToken?: string }>(`${path}?${query}`);
    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

const eventPath = (calendarId: string, eventId?: string) => `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;
export type EventChanges = Pick<GoogleCalendarEvent, 'summary' | 'description' | 'location' | 'start' | 'end' | 'recurrence' | 'reminders' | 'transparency' | 'visibility' | 'colorId'>;

export const fetchCalendarEvent = (calendarId: string, eventId: string) => request<GoogleCalendarEvent>(eventPath(calendarId, eventId));

export async function createCalendarEvent(calendarId: string, id: string, changes: EventChanges) {
  try {
    return await request<GoogleCalendarEvent>(`${eventPath(calendarId)}?sendUpdates=all`, { method: 'POST', body: JSON.stringify({ id, ...changes }) });
  } catch (error) {
    if (!(error instanceof CalendarApiError) || error.status !== 409) throw error;
    // A timed-out insert can have succeeded. Retry using the same ID, never duplicate it.
    const existing = await fetchCalendarEvent(calendarId, id);
    return updateCalendarEvent(calendarId, id, changes, existing.etag);
  }
}

export const updateCalendarEvent = (calendarId: string, eventId: string, changes: EventChanges, etag?: string) => request<GoogleCalendarEvent>(`${eventPath(calendarId, eventId)}?sendUpdates=all`, {
  method: 'PATCH', body: JSON.stringify(changes), headers: etag ? { 'If-Match': etag } : {},
});

export async function deleteCalendarEvent(calendarId: string, eventId: string, etag?: string) {
  try {
    await request<void>(`${eventPath(calendarId, eventId)}?sendUpdates=all`, { method: 'DELETE', headers: etag ? { 'If-Match': etag } : {} });
  } catch (error) {
    if (!(error instanceof CalendarApiError) || error.status !== 410) throw error;
  }
}

export async function moveCalendarEvent(calendarId: string, eventId: string, destination: string, etag?: string) {
  try {
    return await request<GoogleCalendarEvent>(`${eventPath(calendarId, eventId)}/move?${new URLSearchParams({ destination, sendUpdates: 'all' })}`, {
      method: 'POST', headers: etag ? { 'If-Match': etag } : {},
    });
  } catch (error) {
    if (error instanceof CalendarApiError && error.status !== 404 && error.status !== 410) throw error;
    // A move may have completed before the connection dropped; check its destination.
    try { return await fetchCalendarEvent(destination, eventId); } catch { throw error; }
  }
}

export async function fetchCalendars() {
  return paginate<GoogleCalendar>('/users/me/calendarList', { maxResults: '250', minAccessRole: 'reader', showHidden: 'true' });
}

export async function fetchCalendarMonth(calendar: GoogleCalendar, date: Date): Promise<CalendarEvent[]> {
  const { start, end } = monthRange(date);
  const events = await paginate<GoogleCalendarEvent>(`/calendars/${encodeURIComponent(calendar.id)}/events`, {
    timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', maxResults: '2500',
  });
  return events.map((event) => normalizeEvent(event, calendar)).filter((event): event is CalendarEvent => event !== null);
}
