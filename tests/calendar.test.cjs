const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
process.env.TZ = 'Europe/Berlin';

function loadSource(relative, mocks = {}, environment = {}) {
  const filename = path.join(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('.')) return loadSource(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`)), mocks, environment);
    return require(id);
  };
  new Function('exports', 'module', 'require', ...Object.keys(environment), source)(module.exports, module, localRequire, ...Object.values(environment));
  return module.exports;
}

const dates = loadSource('src/calendar/dates.ts');
const calendar = { id: 'work@example.com', summary: 'Arbeit', backgroundColor: '#007AFF' };
const raw = (id, start, end, more = {}) => ({ id, summary: id, start, end, ...more });
const event = (...args) => dates.normalizeEvent(raw(...args), calendar);
const drafts = loadSource('src/calendar/eventDraft.ts');

test('Kanban renders nothing at all without matching appointments, including while loading or offline', () => {
  const state = { todayKey: '2026-11-01', account: 'test', selectedIds: [calendar.id], eventsByMonth: {}, loadingMonths: ['2026-11'], error: 'offline' };
  let query = '';
  const { TodayCalendarEvents } = loadSource('src/components/TodayCalendarEvents.tsx', {
    'react-native': { StyleSheet: { create: (value) => value }, View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'Spinner' },
    'expo-router': { useRouter: () => ({ push: () => {} }) },
    '../hooks/useTheme': { useTheme: () => ({}) },
    '../stores/useCalendarStore': { useCalendarStore: () => state },
    '../stores/useKanbanStore': { useKanbanStore: (select) => select({ searchQuery: query }) },
    './CalendarAgenda': { CalendarAgenda: () => null },
  });
  assert.equal(TodayCalendarEvents(), null);
  state.eventsByMonth['2026-11'] = [event('gestern', { date: '2026-10-31' }, { date: '2026-11-01' })];
  assert.equal(TodayCalendarEvents(), null);
  state.eventsByMonth['2026-11'] = [event('heute', { date: '2026-11-01' }, { date: '2026-11-02' })];
  assert.notEqual(TodayCalendarEvents(), null);
  query = 'kein Treffer';
  assert.equal(TodayCalendarEvents(), null);
});

test('event drafts round-trip all-day end dates and keep advanced recurrence and reminders intact', () => {
  const source = raw('reise', { date: '2026-11-01' }, { date: '2026-11-04' }, {
    recurrence: ['RRULE:FREQ=MONTHLY;BYDAY=-1FR', 'EXDATE;VALUE=DATE:20261127'],
    reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 1440 }, { method: 'popup', minutes: 10 }] },
  });
  const draft = drafts.draftFromEvent(source);
  assert.equal(dates.dayKey(draft.end), '2026-11-03');
  const changes = drafts.buildEventChanges(draft);
  assert.deepEqual(changes.start, source.start);
  assert.deepEqual(changes.end, source.end);
  assert.deepEqual(changes.recurrence, source.recurrence);
  assert.deepEqual(changes.reminders, source.reminders);
  assert.equal(changes.colorId, null);
});

test('new events start at 10:00 in the chosen calendar timezone', () => {
  const draft = drafts.draftFromEvent(undefined, new Date(2026, 10, 1), 'America/New_York');
  assert.equal(draft.start.toISOString(), '2026-11-01T15:00:00.000Z');
  assert.equal(draft.end.toISOString(), '2026-11-01T16:00:00.000Z');
  assert.equal(drafts.canWriteCalendar('reader'), false);
  assert.equal(drafts.canWriteCalendar('writer'), true);
});

test('recurrence supports interval, weekdays, count, inclusive end dates, and single-instance edits', () => {
  const draft = { ...drafts.draftFromEvent(undefined, new Date(2026, 10, 1), 'Europe/Berlin'), title: 'Serie', repeat: 'weekly', interval: '2', weekdays: ['MO', 'FR'], repeatEnd: 'count', count: '12' };
  assert.deepEqual(drafts.buildEventChanges(draft).recurrence, ['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=12']);
  assert.equal('recurrence' in drafts.buildEventChanges(draft, true), false);
  draft.repeatEnd = 'on'; draft.until = new Date(2026, 10, 30);
  assert.match(drafts.buildEventChanges(draft).recurrence[0], /UNTIL=20261130T225959Z$/);
  draft.allDay = true;
  assert.match(drafts.buildEventChanges(draft).recurrence[0], /UNTIL=20261130$/);
});

test('all-day toggling and rescheduling preserve covered dates across DST', () => {
  const timed = drafts.draftFromEvent(raw('bis Mitternacht', { dateTime: '2026-10-24T10:00:00+02:00' }, { dateTime: '2026-10-25T00:00:00+02:00' }));
  const allDay = drafts.toggleAllDay(timed, true);
  assert.equal(dates.dayKey(allDay.start), '2026-10-24');
  assert.equal(dates.dayKey(allDay.end), '2026-10-24');
  const multi = { ...allDay, end: new Date(2026, 9, 26) };
  const moved = drafts.changeDraftStart(multi, new Date(2026, 9, 25));
  assert.equal(dates.dayKey(moved.end), '2026-10-27');
  const timedAgain = drafts.toggleAllDay(allDay, false);
  assert.equal(timedAgain.start.toISOString(), '2026-10-24T08:00:00.000Z');
});

test('invalid dates, timezones, recurrence choices, and reminders never produce a writable payload', () => {
  const valid = { ...drafts.draftFromEvent(undefined, new Date(2026, 10, 1)), title: 'Test' };
  assert.throws(() => drafts.buildEventChanges({ ...valid, title: ' ' }), /Titel/);
  assert.throws(() => drafts.buildEventChanges({ ...valid, end: valid.start }), /Ende/);
  assert.throws(() => drafts.buildEventChanges({ ...valid, timeZone: 'bad-zone' }), /Zeitzone/);
  assert.throws(() => drafts.buildEventChanges({ ...valid, repeat: 'weekly', weekdays: [] }), /Wochentag/);
  assert.throws(() => drafts.buildEventChanges({ ...valid, reminderMode: 'custom', reminders: [{ method: 'popup', minutes: '-1' }] }), /Erinnerungen/);
  assert.throws(() => drafts.buildEventChanges({ ...valid, repeat: 'daily', repeatEnd: 'count', count: '0' }), /Anzahl/);
});

test('event updates PATCH only editable fields and protect the original etag', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ id: 'event-1', etag: 'new-etag' }) }; };
  try {
    const api = loadSource('src/calendar/googleCalendarApi.ts', { '../auth/googleAuth': { getValidAccessToken: async () => 'test-only', getAuthVersion: () => 0 } });
    await api.updateCalendarEvent(calendar.id, 'event/1', { summary: 'Neu', description: 'Notiz' }, 'old-etag');
    assert.equal(calls[0].options.method, 'PATCH');
    assert.equal(calls[0].options.headers['If-Match'], 'old-etag');
    assert.deepEqual(JSON.parse(calls[0].options.body), { summary: 'Neu', description: 'Notiz' });
    assert.match(calls[0].url, /event%2F1\?sendUpdates=all/);
    assert.equal('attendees' in JSON.parse(calls[0].options.body), false);
  } finally { global.fetch = originalFetch; }
});

test('a retried insert uses its stable id and recovers the existing event instead of duplicating it', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return { ok: false, status: 409, json: async () => ({}) };
    return { ok: true, json: async () => ({ id: 'stableid', etag: 'existing-etag' }) };
  };
  try {
    const api = loadSource('src/calendar/googleCalendarApi.ts', { '../auth/googleAuth': { getValidAccessToken: async () => 'test-only', getAuthVersion: () => 0 } });
    await api.createCalendarEvent(calendar.id, 'stableid', { summary: 'Erneut speichern' });
    assert.equal(JSON.parse(calls[0].options.body).id, 'stableid');
    assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1);
    assert.equal(calls[2].options.method, 'PATCH');
    assert.equal(calls[2].options.headers['If-Match'], 'existing-etag');
  } finally { global.fetch = originalFetch; }
});

test('delete accepts an empty 204 body, and etag conflicts remain actionable', async () => {
  const originalFetch = global.fetch;
  try {
    const api = loadSource('src/calendar/googleCalendarApi.ts', { '../auth/googleAuth': { getValidAccessToken: async () => 'test-only', getAuthVersion: () => 0 } });
    global.fetch = async () => ({ ok: true, status: 204, json: () => { throw new Error('204 has no JSON'); } });
    await api.deleteCalendarEvent(calendar.id, 'event', 'etag');
    global.fetch = async () => ({ ok: false, status: 412, json: async () => ({}) });
    await assert.rejects(api.updateCalendarEvent(calendar.id, 'event', { summary: 'Titel' }, 'old'), (error) => error.status === 412 && error.message.includes('inzwischen geändert'));
  } finally { global.fetch = originalFetch; }
});

test('moving after a lost response checks the destination rather than duplicating the event', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) throw new TypeError('Network lost');
    return { ok: true, json: async () => ({ id: 'event', etag: 'moved' }) };
  };
  try {
    const api = loadSource('src/calendar/googleCalendarApi.ts', { '../auth/googleAuth': { getValidAccessToken: async () => 'test-only', getAuthVersion: () => 0 } });
    const moved = await api.moveCalendarEvent(calendar.id, 'event', 'target@example.com', 'old');
    assert.equal(moved.etag, 'moved');
    assert.equal(new URL(calls[0].url).searchParams.get('destination'), 'target@example.com');
    assert.match(calls[1].url, /target%40example.com\/events\/event$/);
  } finally { global.fetch = originalFetch; }
});

test('refresh after a mutation cannot be overwritten by a read started before saving', async () => {
  let finishOld;
  let calls = 0;
  const latest = event('aktuell', { date: '2026-11-01' }, { date: '2026-11-02' });
  const { useCalendarStore: store } = loadSource('src/stores/useCalendarStore.ts', {
    '../auth/googleAuth': { loadCachedUser: async () => null },
    '../calendar/googleCalendarApi': { CalendarApiError: class extends Error {}, fetchCalendars: async () => [calendar], fetchCalendarMonth: async () => ++calls === 1 ? new Promise((resolve) => { finishOld = resolve; }) : [latest] },
    '../db/database': { getSetting: async () => '[]', setSetting: async () => {} },
  });
  await store.getState().connectAccount('mutation@example.com');
  store.setState({ selectedIds: [calendar.id], eventsByMonth: { '2026-11': [] } });
  const staleRead = store.getState().loadMonth(new Date(2026, 10, 1), true);
  await store.getState().refreshAfterMutation([new Date(2026, 10, 1)]);
  finishOld([]);
  await staleRead;
  assert.equal(store.getState().eventsByMonth['2026-11'][0].title, 'aktuell');
});

test('weeks run Monday to Sunday across month and year boundaries', () => {
  assert.deepEqual(dates.weekDays(new Date(2026, 10, 1)).map(dates.dayKey), [
    '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
  ]);
  const yearWeek = dates.weekDays(new Date(2027, 0, 1));
  assert.equal(dates.dayKey(yearWeek[0]), '2026-12-28');
  assert.equal(dates.dayKey(yearWeek[6]), '2027-01-03');
  assert.deepEqual([...new Set(yearWeek.map(dates.monthKey))], ['2026-12', '2027-01']);
});

test('week navigation keeps local dates across daylight saving changes', () => {
  const week = dates.weekDays(new Date(2026, 2, 29));
  assert.equal(dates.dayKey(week[0]), '2026-03-23');
  assert.equal(dates.dayKey(week[6]), '2026-03-29');
  const nextMonday = new Date(week[0].getFullYear(), week[0].getMonth(), week[0].getDate() + 7);
  assert.equal(dates.dayKey(nextMonday), '2026-03-30');
  assert.equal(nextMonday.getHours(), 0);
});

test('a cross-month week loads both months once and includes a spanning event in each affected day', async () => {
  const calls = [];
  const spanningEvent = event('über Monatswechsel', { date: '2026-10-31' }, { date: '2026-11-02' });
  const { useCalendarStore: store } = loadSource('src/stores/useCalendarStore.ts', {
    '../auth/googleAuth': { loadCachedUser: async () => null },
    '../calendar/googleCalendarApi': {
      CalendarApiError: class extends Error {}, fetchCalendars: async () => [calendar],
      fetchCalendarMonth: async (_, date) => { calls.push(dates.monthKey(date)); return [spanningEvent]; },
    },
    '../db/database': { getSetting: async () => '[]', setSetting: async () => {} },
  });
  await store.getState().connectAccount('week@example.com');
  store.setState({ selectedIds: [calendar.id] });
  const week = dates.weekDays(new Date(2026, 10, 1));
  await Promise.all(week.map((date) => store.getState().loadMonth(date)));
  assert.deepEqual(calls.sort(), ['2026-10', '2026-11']);
  const shown = week.map((date) => dates.eventsForDay(store.getState().eventsByMonth[dates.monthKey(date)], date).length);
  assert.deepEqual(shown, [0, 0, 0, 0, 0, 1, 1]);
});

test('all-day dates are local; Google exclusive end dates do not leak into tomorrow', () => {
  const e = event('Ganztägig', { date: '2026-11-01' }, { date: '2026-11-02' });
  assert.equal(dates.eventsForDay([e], new Date(2026, 10, 1)).length, 1);
  assert.equal(dates.eventsForDay([e], new Date(2026, 10, 2)).length, 0);
  assert.equal(dates.eventTimeLabel(e), 'Ganztägig');
});

test('local today handles timezone offsets, overnight events, and exact midnight boundaries', () => {
  const es = [
    event('gestern', { dateTime: '2026-10-31T22:00:00+01:00' }, { dateTime: '2026-11-01T00:00:00+01:00' }),
    event('über Nacht', { dateTime: '2026-10-31T23:00:00+01:00' }, { dateTime: '2026-11-01T01:00:00+01:00' }),
    event('UTC morgen', { dateTime: '2026-11-01T23:30:00Z' }, { dateTime: '2026-11-02T00:30:00Z' }),
    event('heute', { dateTime: '2026-11-01T10:00:00+01:00' }, { dateTime: '2026-11-01T11:00:00+01:00' }),
  ];
  assert.deepEqual(dates.eventsForDay(es, new Date(2026, 10, 1)).map((e) => e.title), ['über Nacht', 'heute']);
  assert.deepEqual(dates.eventsForDay(es, new Date(2026, 10, 2)).map((e) => e.title), ['UTC morgen']);
});

test('multi-day and DST events span each affected local day exactly once', () => {
  const e = event('Reise', { date: '2026-10-24' }, { date: '2026-10-27' });
  assert.equal(dates.eventsForDay([e], new Date(2026, 9, 25)).length, 1);
  assert.equal(dates.eventsForDay([e], new Date(2026, 9, 26)).length, 1);
  assert.equal(dates.eventsForDay([e], new Date(2026, 9, 27)).length, 0);
  const range = dates.monthRange(new Date(2026, 9, 25));
  assert.equal((range.end - range.start) / 3600000, 31 * 24 + 1);
});

test('cancelled, declined, malformed, and deselected events are excluded', () => {
  const start = { date: '2026-11-01' }, end = { date: '2026-11-02' };
  assert.equal(event('abgesagt', start, end, { status: 'cancelled' }), null);
  assert.equal(event('abgelehnt', start, end, { attendees: [{ self: true, responseStatus: 'declined' }] }), null);
  assert.equal(event('ungültig', { dateTime: 'invalid' }, end), null);
  const e = event('sichtbar', start, end);
  assert.equal(dates.eventsForDay([e], new Date(2026, 10, 1), []).length, 0);
  assert.equal(dates.eventsForDay([e], new Date(2026, 10, 1), [calendar.id]).length, 1);
  const other = dates.normalizeEvent(raw('sichtbar', start, end), { ...calendar, id: 'other' });
  assert.notEqual(e.id, other.id);
});

test('API follows pagination, encodes calendar IDs, and expands recurring instances', async () => {
  const originalFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(new URL(url));
    return { ok: true, json: async () => urls.length === 1 ? { items: [], nextPageToken: 'next+page' } : { items: [raw('Termin', { date: '2026-11-01' }, { date: '2026-11-02' })] } };
  };
  try {
    const api = loadSource('src/calendar/googleCalendarApi.ts', { '../auth/googleAuth': { getValidAccessToken: async () => 'test-only', getAuthVersion: () => 0 } });
    const data = await api.fetchCalendarMonth(calendar, new Date(2026, 10, 1));
    assert.equal(data.length, 1);
    assert.match(urls[0].pathname, /work%40example.com/);
    assert.equal(urls[0].searchParams.get('singleEvents'), 'true');
    assert.equal(urls[0].searchParams.get('showDeleted'), 'false');
    assert.equal(urls[1].searchParams.get('pageToken'), 'next+page');
    assert.equal(urls[0].searchParams.get('timeMin'), new Date(2026, 10, 1).toISOString());
    assert.equal(urls[0].searchParams.get('timeMax'), new Date(2026, 11, 1).toISOString());
  } finally { global.fetch = originalFetch; }
});

test('calendar permission errors offer reauthorization rather than an empty calendar', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'insufficientPermissions' }] } }) });
  try {
    const api = loadSource('src/calendar/googleCalendarApi.ts', { '../auth/googleAuth': { getValidAccessToken: async () => 'test-only', getAuthVersion: () => 0 } });
    await assert.rejects(api.fetchCalendars(), (error) => error.reconnect === true);
  } finally { global.fetch = originalFetch; }
});

test('late responses cannot restore deselected calendar events or a disconnected account', async () => {
  let resolveRequest;
  const api = {
    CalendarApiError: class extends Error {},
    fetchCalendars: async () => [calendar],
    fetchCalendarMonth: () => new Promise((resolve) => { resolveRequest = resolve; }),
  };
  const saved = [];
  const { useCalendarStore: store } = loadSource('src/stores/useCalendarStore.ts', {
    '../auth/googleAuth': { loadCachedUser: async () => null },
    '../calendar/googleCalendarApi': api,
    '../db/database': { getSetting: async () => '[]', setSetting: async (key, value) => { saved.push(JSON.parse(value)); } },
  });
  await store.getState().connectAccount('one@example.com');
  const selecting = store.getState().selectCalendars([calendar.id]);
  await new Promise((resolve) => setImmediate(resolve));
  const deselecting = store.getState().selectCalendars([]);
  resolveRequest([event('stale', { date: '2026-11-01' }, { date: '2026-11-02' })]);
  await Promise.all([selecting, deselecting]);
  assert.deepEqual(store.getState().eventsByMonth, {});
  assert.deepEqual(saved.at(-1), []);
  const reselecting = store.getState().selectCalendars([calendar.id]);
  await new Promise((resolve) => setImmediate(resolve));
  store.getState().disconnect();
  resolveRequest([event('stale', { date: '2026-11-01' }, { date: '2026-11-02' })]);
  await reselecting;
  assert.equal(store.getState().account, null);
  assert.deepEqual(store.getState().eventsByMonth, {});
});

test('midnight and foreground refresh remove yesterday from Today even without fetching new events', () => {
  let now = new Date(2026, 10, 1, 23, 59).getTime();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  let timer, foregroundListener;
  let removed = false;
  const yesterdayEvent = event('Heute', { date: '2026-11-01' }, { date: '2026-11-02' });
  const state = {
    account: 'one@example.com', calendars: [calendar], todayKey: '2026-11-01',
    initialize: async () => {}, loadMonth: async () => {},
    updateDay: () => { state.todayKey = dates.dayKey(new Date(now)); },
  };
  const { startCalendarSync } = loadSource('src/calendar/lifecycle.ts', {
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, listener) => { foregroundListener = listener; return { remove: () => { removed = true; } }; } } },
    '@react-native-community/netinfo': { addEventListener: () => () => {} },
    '../stores/useCalendarStore': { useCalendarStore: { getState: () => state } },
  }, {
    Date: ClockDate,
    setTimeout: (callback, delay) => { timer = { callback, delay }; return 1; }, clearTimeout: () => {},
    setInterval: () => 2, clearInterval: () => {},
  });
  const stop = startCalendarSync();
  assert.equal(timer.delay, 60100);
  now = new Date(2026, 10, 2).getTime() + 100;
  timer.callback();
  assert.equal(state.todayKey, '2026-11-02');
  assert.equal(dates.eventsForDay([yesterdayEvent], dates.localDate(state.todayKey)).length, 0);
  now = new Date(2026, 10, 3, 8).getTime();
  foregroundListener('active');
  assert.equal(state.todayKey, '2026-11-03');
  stop();
  assert.equal(removed, true);
});
