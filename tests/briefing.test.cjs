const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const filename = path.join(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const localRequire = id => id in mocks ? mocks[id] : id.startsWith('.') ? load(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`)), mocks) : require(id);
  new Function('exports', 'module', 'require', source)(module.exports, module, localRequire);
  return module.exports;
}
const { buildBriefing, briefingDates, BRIEFING_PREFIX } = load('src/services/briefing.ts');
const snapshot = () => ({ enabled: true, lists: [{ id: 'visible', isVisible: true }, { id: 'hidden', isVisible: false }], tasksByList: {
  visible: [{ id: 'a', title: 'Rechnung prüfen', status: 'needsAction', due: new Date(2026, 10, 2, 12).toISOString(), localPosition: 0 }, { id: 'done', title: 'Nicht zeigen', status: 'completed' }],
  hidden: [{ id: 'secret', title: 'Versteckte Aufgabe', status: 'needsAction' }],
}, selectedCalendarIds: ['selected'], eventsByMonth: { '2026-11': [
  { id: 'event', calendarId: 'selected', title: 'Besprechung', start: new Date(2026, 10, 2, 10).toISOString(), end: new Date(2026, 10, 2, 11).toISOString(), allDay: false },
  { id: 'tomorrow', calendarId: 'selected', title: 'Morgen-Termin', start: '2026-11-03', end: '2026-11-04', allDay: true },
  { id: 'hidden', calendarId: 'other', title: 'Anderer Kalender', start: '2026-11-02', end: '2026-11-03', allDay: true },
] }, calendarError: false, capturedAt: new Date(2026, 10, 1, 20) });

test('each day includes its own selected calendar events and only visible open tasks', () => {
  const data = snapshot();
  const today = buildBriefing(data, new Date(2026, 10, 2));
  assert.equal(today.taskCount, 1); assert.equal(today.eventCount, 1);
  assert.match(today.body, /Rechnung prüfen/); assert.match(today.body, /10:00 · Besprechung/);
  for (const text of ['Nicht zeigen', 'Versteckte Aufgabe', 'Morgen-Termin', 'Anderer Kalender']) assert.ok(!today.body.includes(text));
  const tomorrow = buildBriefing(data, new Date(2026, 10, 3));
  assert.match(tomorrow.body, /Ganztägig · Morgen-Termin/); assert.ok(!tomorrow.body.includes('Besprechung'));
  assert.match(today.body, /Stand/);
});

test('missing calendar data is not presented as zero appointments and cross-month duplicates count once', () => {
  const data = snapshot();
  const missing = buildBriefing({ ...data, eventsByMonth: {} }, new Date(2026, 10, 2));
  assert.match(missing.body, /noch nicht geladen/); assert.ok(!missing.body.includes('0 Termine'));
  data.eventsByMonth['2026-10'] = [data.eventsByMonth['2026-11'][0]];
  assert.equal(buildBriefing(data, new Date(2026, 10, 2)).eventCount, 1);
});

test('14 daily dates stay at 08:30, including across month and daylight-saving boundaries', () => {
  for (const now of [new Date(2026, 9, 24, 8), new Date(2026, 9, 31, 9), new Date(2026, 11, 31, 23)]) {
    const dates = briefingDates(now);
    assert.equal(dates.length, 14); assert.ok(dates[0] > now);
    assert.ok(dates.every(date => date.getHours() === 8 && date.getMinutes() === 30));
    assert.equal(new Set(dates.map(date => date.toDateString())).size, 14);
  }
  assert.equal(briefingDates(new Date(2026, 10, 2, 8, 30))[0].getDate(), 3);
});

function scheduler(options = {}) {
  const scheduled = [], canceled = [], status = {};
  const { scheduleBriefings } = load('src/services/briefingScheduler.ts', {
    '../stores/useBriefingStatus': { useBriefingStatus: { setState: value => Object.assign(status, value) } },
    './notificationPermissions': { requestNotificationPermissions: async () => options.permission !== false },
    '../security/privacy': { notificationText: async (title, body) => options.private ? { title: 'Planner', body: 'Verborgener Inhalt' } : { title, body } },
    'expo-notifications': {
      SchedulableTriggerInputTypes: { DATE: 'date' },
      cancelScheduledNotificationAsync: async id => { canceled.push(id); if (options.cancel) await options.cancel(id); },
      getAllScheduledNotificationsAsync: async () => options.pending || [],
      scheduleNotificationAsync: async request => { if (options.fail) throw new Error('native failure'); scheduled.push(request); },
    },
  });
  return { scheduleBriefings, scheduled, canceled, status };
}

test('daily summaries use separate dated triggers, never one indefinitely stale repeating body', async () => {
  const f = scheduler(); await f.scheduleBriefings(snapshot());
  assert.equal(f.scheduled.length, 14);
  assert.equal(new Set(f.scheduled.map(request => request.identifier)).size, 14);
  assert.ok(f.scheduled.every(request => request.trigger.type === 'date' && request.trigger.date.getHours() === 8 && request.trigger.date.getMinutes() === 30));
  assert.ok(f.canceled.includes('daily-briefing'));
  assert.equal(f.status.count, 14);
});

test('turning the overview off cancels its notifications without canceling task reminders', async () => {
  const f = scheduler({ pending: [{ identifier: `${BRIEFING_PREFIX}2026-11-03` }, { identifier: 'task-private' }] });
  await f.scheduleBriefings({ ...snapshot(), enabled: false });
  assert.equal(f.scheduled.length, 0); assert.ok(f.canceled.includes(`${BRIEFING_PREFIX}2026-11-03`)); assert.ok(!f.canceled.includes('task-private'));
});

test('private mode schedules no task or calendar title and pending capacity is respected', async () => {
  const f = scheduler({ private: true, pending: Array.from({ length: 58 }, (_, i) => ({ identifier: `task-${i}` })) });
  await f.scheduleBriefings(snapshot());
  assert.equal(f.scheduled.length, 2); assert.equal(f.status.count, 2);
  assert.ok(!JSON.stringify(f.scheduled).includes('Rechnung')); assert.ok(!JSON.stringify(f.scheduled).includes('Besprechung'));
});

test('new settings supersede a pending schedule operation and native failures remain visible', async () => {
  let finish, began;
  const started = new Promise(resolve => { began = resolve; });
  let first = true;
  const f = scheduler({ cancel: () => { if (first) { first = false; began(); return new Promise(resolve => { finish = resolve; }); } } });
  const old = f.scheduleBriefings(snapshot()); await started;
  const next = f.scheduleBriefings({ ...snapshot(), enabled: false }); finish(); await Promise.all([old, next]);
  assert.equal(f.scheduled.length, 0);
  const failure = scheduler({ fail: true }); await assert.rejects(failure.scheduleBriefings(snapshot())); assert.equal(failure.status.error, true);
});

test('a revoked permission removes old overview contents', async () => {
  const id = `${BRIEFING_PREFIX}2026-11-03`;
  const f = scheduler({ permission: false, pending: [{ identifier: id }] });
  await f.scheduleBriefings(snapshot()); assert.ok(f.canceled.includes(id)); assert.equal(f.scheduled.length, 0);
});

test('iOS app icon catalog includes notification-sized PNGs from the existing logo', async () => {
  const { addNotificationIcons } = require('../plugins/withNotificationAppIcons');
  const { getPngInfo } = require('@expo/image-utils');
  const catalog = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-icons-'));
  fs.writeFileSync(path.join(catalog, 'Contents.json'), JSON.stringify({ images: [{ idiom: 'universal', platform: 'ios', size: '1024x1024', filename: 'large.png' }], info: { version: 1, author: 'expo' } }));
  await addNotificationIcons(path.resolve(__dirname, '..'), catalog, './assets/icon.png');
  const contents = JSON.parse(fs.readFileSync(path.join(catalog, 'Contents.json'), 'utf8'));
  const small = contents.images.find(image => image.idiom === 'iphone' && image.size === '20x20' && image.scale === '2x');
  assert.ok(small); assert.ok(contents.images.some(image => image.size === '1024x1024'));
  assert.equal((await getPngInfo(path.join(catalog, small.filename))).width, 40);
  const resolved = path.resolve(catalog);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'planner-icons-'));
  fs.rmSync(resolved, { recursive: true });
});
