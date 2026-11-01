export interface GoogleCalendar {
  id: string;
  summary: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: string;
  timeZone?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  etag?: string;
  eventType?: string;
  locked?: boolean;
  organizer?: { self?: boolean; email?: string };
  recurringEventId?: string;
  recurrence?: string[];
  transparency?: 'opaque' | 'transparent';
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  colorId?: string | null;
  reminders?: { useDefault: boolean; overrides?: { method: 'email' | 'popup'; minutes: number }[] };
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

export interface CalendarEvent {
  id: string;
  eventId: string;
  calendarId: string;
  calendarTitle: string;
  color: string;
  title: string;
  location: string;
  url: string | null;
  start: string;
  end: string;
  allDay: boolean;
}
