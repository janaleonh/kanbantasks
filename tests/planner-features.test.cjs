const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const filename = path.join(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const localRequire = id => id in mocks ? mocks[id] : id.startsWith('.') ? load(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`)), mocks) : require(id);
  new Function('exports', 'module', 'require', source)(module.exports, module, localRequire);
  return module.exports;
}
const details = load('src/tasks/details.ts');

async function database() {
  const raw = new DatabaseSync(':memory:');
  let writes = Promise.resolve();
  const adapter = {
    execAsync: async sql => raw.exec(sql),
    runAsync: async (sql, args = []) => raw.prepare(sql).run(...args),
    getFirstAsync: async (sql, args = []) => raw.prepare(sql).get(...args) || null,
    getAllAsync: async (sql, args = []) => raw.prepare(sql).all(...args),
    closeAsync: async () => raw.close(),
    withExclusiveTransactionAsync: fn => {
      const next = writes.catch(() => {}).then(async () => { raw.exec('BEGIN'); try { await fn(adapter); raw.exec('COMMIT'); } catch (err) { raw.exec('ROLLBACK'); throw err; } });
      writes = next; return next;
    },
  };
  // Existing tasks without any of the new fields must survive migrations.
  raw.exec("CREATE TABLE task_lists (id TEXT PRIMARY KEY, remoteId TEXT, title TEXT, position INTEGER, isVisible INTEGER, color TEXT, updatedAt TEXT, syncStatus TEXT, deletedLocally INTEGER); CREATE TABLE tasks (id TEXT PRIMARY KEY, remoteId TEXT, listId TEXT, title TEXT, notes TEXT, status TEXT, due TEXT, position TEXT, localPosition INTEGER, updatedAt TEXT, syncStatus TEXT, deletedLocally INTEGER); INSERT INTO task_lists VALUES ('list',NULL,'Privat',0,1,NULL,'2026-11-01','pending',0); INSERT INTO tasks VALUES ('legacy',NULL,'list','Vorhanden','Originalnotiz','needsAction',NULL,NULL,0,'2026-11-01','pending',0);");
  const db = load('src/db/database.ts', { 'expo-sqlite': { openDatabaseAsync: async () => adapter } });
  await db.getDatabase();
  const repo = load('src/db/taskRepo.ts', { './database': { getDatabase: async () => adapter }, '../utils/uuid': { generateUUID: randomUUID } });
  return { raw, adapter, repo };
}

function recoveryModules(adapter, email = 'owner@example.test') {
  const getSetting = async (key, fallback) => (await adapter.getFirstAsync('SELECT value FROM sync_meta WHERE key = ?', [key]))?.value ?? fallback;
  const mocks = { './database': { getDatabase: async () => adapter }, '../db/database': { getDatabase: async () => adapter, getSetting }, '../utils/uuid': { generateUUID: randomUUID }, '../auth/googleAuth': { loadCachedUser: async () => email ? { email } : null } };
  return { history: load('src/db/history.ts', mocks), backup: load('src/backup/database.ts', mocks), lists: load('src/db/taskListRepo.ts', mocks) };
}

test('projects and tags validate, survive storage and propagate to recurring follow-up tasks', async () => {
  const { raw, adapter, repo } = await database();
  const { history } = recoveryModules(adapter);
  assert.throws(() => details.validateDetails({ tags: ['bad\nlabel'] }));
  await repo.updateTask('legacy', { project: ' Urlaub ', tags: ['Plan', 'plan', 'Jana'], recurrence: { frequency: 'weekly', interval: 1 } });
  const change = (await history.getHistory())[0];
  await repo.toggleTaskStatus('legacy');
  const next = (await repo.getTasksByListId('list')).find(task => task.id !== 'legacy');
  assert.equal(next.project, 'Urlaub');
  assert.deepEqual(next.tags, ['plan', 'Jana']);
  await assert.rejects(history.restoreHistory(change.id), /inzwischen verändert/);
  await history.restoreHistory(change.id, true);
  assert.equal((await repo.getTasksByListId('list')).length, 3);
  assert.equal((await repo.getTaskById('legacy')).status, 'completed');
  raw.close();
});

test('undo restores deleted tasks both before and after remote cleanup without reusing a deleted remote ID', async () => {
  const { raw, adapter, repo } = await database();
  const { history } = recoveryModules(adapter);
  raw.exec("UPDATE tasks SET remoteId='remote-old', syncStatus='synced' WHERE id='legacy'");
  await repo.deleteTask('legacy');
  await history.restoreHistory((await history.getHistory())[0].id);
  assert.equal((await repo.getTaskById('legacy')).remoteId, 'remote-old');
  assert.equal((await repo.getTaskById('legacy')).deletedLocally, false);
  await repo.deleteTask('legacy');
  const entry = (await history.getHistory())[0];
  raw.exec("DELETE FROM tasks WHERE id='legacy'");
  await history.restoreHistory(entry.id);
  assert.equal((await repo.getTaskById('legacy')).remoteId, null);
  assert.equal((await repo.getTaskById('legacy')).syncStatus, 'pending');
  await assert.rejects(history.restoreHistory(entry.id), /bereits wiederhergestellt/);
  raw.close();
});

test('undo ignores bookkeeping changes but rejects newer content changes', async () => {
  const { raw, adapter, repo } = await database();
  const { history } = recoveryModules(adapter);
  await repo.updateTask('legacy', { title: 'Neu' });
  let entry = (await history.getHistory())[0];
  raw.exec("UPDATE tasks SET remoteId='assigned', updatedAt='later', syncStatus='synced' WHERE id='legacy'");
  await history.restoreHistory(entry.id);
  assert.equal((await repo.getTaskById('legacy')).title, 'Vorhanden');
  assert.equal((await repo.getTaskById('legacy')).remoteId, 'assigned');
  await repo.updateTask('legacy', { notes: 'Änderung' });
  entry = (await history.getHistory())[0];
  raw.exec("UPDATE tasks SET notes='Andere neuere Notiz' WHERE id='legacy'");
  await assert.rejects(history.restoreHistory(entry.id), /inzwischen verändert/);
  assert.equal((await repo.getTaskById('legacy')).notes, 'Andere neuere Notiz');
  raw.close();
});

test('deleted lists recover as separate lists with every active child, preserving projects', async () => {
  const { raw, adapter, repo } = await database();
  const { history, lists } = recoveryModules(adapter);
  await repo.updateTask('legacy', { project: 'Haus', tags: ['Rechnung'] });
  await lists.deleteTaskList('list');
  raw.exec("DELETE FROM tasks; DELETE FROM task_lists;");
  await history.restoreHistory((await history.getHistory())[0].id);
  const task = raw.prepare('SELECT * FROM tasks').get();
  assert.notEqual(task.id, 'legacy');
  assert.notEqual(task.listId, 'list');
  assert.equal(task.project, 'Haus');
  assert.equal(raw.prepare('SELECT title FROM task_lists').get().title, 'Privat');
  raw.close();
});

test('backup round-trip merges without overwriting tasks, excludes credentials and remaps repetition receipts', async () => {
  const { raw, adapter, repo } = await database();
  const { backup } = recoveryModules(adapter);
  raw.exec("INSERT INTO sync_meta (key,value) VALUES ('googleTasksOwner','owner@example.test'), ('secretToken','must-never-export');");
  await repo.updateTask('legacy', { project: 'Haus', tags: ['Jana'], recurrence: { frequency: 'daily', interval: 1 } });
  await repo.toggleTaskStatus('legacy');
  const data = await backup.collectBackup();
  assert.equal(data.tasks.length, 2);
  assert.equal(JSON.stringify(data).includes('must-never-export'), false);
  assert.equal(JSON.stringify(data).includes('remoteId'), false);
  const result = await backup.restoreBackup(data);
  assert.deepEqual(result, { lists: 1, tasks: 2 });
  assert.equal(raw.prepare('SELECT count(*) n FROM tasks').get().n, 4);
  const cloned = raw.prepare("SELECT * FROM tasks WHERE listId <> 'list' AND status='completed'").get();
  assert.equal(cloned.project, 'Haus');
  const receipt = raw.prepare('SELECT * FROM task_repeat_receipts WHERE sourceId=?').get(cloned.id);
  assert.ok(receipt);
  assert.notEqual(receipt.nextTaskId, data.repeatReceipts[0].nextTaskId);
  assert.equal(raw.prepare('SELECT repeatSourceId FROM tasks WHERE id=?').get(receipt.nextTaskId).repeatSourceId, cloned.id);
  assert.equal(await repo.materializeCompletedRepeats(), 0);
  raw.close();
});

test('restoring a recurring list never replaces original follow-up rows through the unique repetition index', async () => {
  const { raw, adapter, repo } = await database();
  const { history, lists } = recoveryModules(adapter);
  await repo.updateTask('legacy', { recurrence: { frequency: 'daily', interval: 1 } });
  await repo.toggleTaskStatus('legacy');
  const originalIds = raw.prepare('SELECT id FROM tasks').all().map(row => row.id);
  await lists.deleteTaskList('list');
  await history.restoreHistory((await history.getHistory())[0].id);
  assert.equal(raw.prepare('SELECT count(*) n FROM tasks').get().n, 4);
  for (const id of originalIds) assert.ok(raw.prepare('SELECT id FROM tasks WHERE id=?').get(id));
  assert.equal(await repo.materializeCompletedRepeats(), 0);
  raw.close();
});

test('undo reverses a cross-list move without losing the original remote location', async () => {
  const { raw, adapter, repo } = await database();
  const { history, lists } = recoveryModules(adapter);
  const target = await lists.createTaskList('Anders');
  raw.exec("UPDATE tasks SET remoteId='remote', syncStatus='synced' WHERE id='legacy'");
  await repo.moveTask('legacy', target.id, 0);
  assert.equal((await repo.getTaskById('legacy')).previousListId, 'list');
  await history.restoreHistory((await history.getHistory())[0].id);
  assert.equal((await repo.getTaskById('legacy')).listId, 'list');
  assert.equal((await repo.getTaskById('legacy')).previousListId, null);
  await assert.rejects(repo.moveTask('legacy', 'missing', 0));
  assert.equal((await repo.getTaskById('legacy')).listId, 'list');
  raw.close();
});

test('backup rejects another account and keeps deleted follow-ups deleted when restoring recurrence receipts', async () => {
  const { raw, adapter, repo } = await database();
  const { backup } = recoveryModules(adapter);
  raw.exec("INSERT INTO sync_meta (key,value) VALUES ('googleTasksOwner','owner@example.test')");
  await repo.updateTask('legacy', { recurrence: { frequency: 'weekly', interval: 1 } });
  await repo.toggleTaskStatus('legacy');
  raw.exec("DELETE FROM tasks WHERE id <> 'legacy'");
  const data = await backup.collectBackup();
  await assert.rejects(backup.restoreBackup({ ...data, owner: 'stranger@example.test' }), /anderen Google-Konto/);
  assert.equal(raw.prepare('SELECT count(*) n FROM tasks').get().n, 1);
  await backup.restoreBackup(data);
  assert.equal(await repo.materializeCompletedRepeats(), 0);
  assert.equal(raw.prepare('SELECT count(*) n FROM tasks').get().n, 2);
  raw.close();
});

test('backup parser rejects malformed relationships, unsupported versions, traversal and excessive input', async () => {
  const { raw, adapter } = await database();
  const { backup } = recoveryModules(adapter);
  const { validateBackupData, decodeBackup, MAX_BACKUP_BYTES } = load('src/backup/format.ts');
  const data = await backup.collectBackup();
  assert.throws(() => validateBackupData({ ...data, tasks: [...data.tasks, data.tasks[0]] }));
  assert.throws(() => validateBackupData({ ...data, tasks: [{ ...data.tasks[0], listId: 'unknown' }] }));
  assert.throws(() => validateBackupData({ ...data, tasks: [{ ...data.tasks[0], attachments: [{ id: 'x', configId: 'a'.repeat(64), path: '../secret', name: 'secret' }] }] }));
  assert.throws(() => decodeBackup(JSON.stringify({ format: 'planner-backup', version: 2, checksum: 'a'.repeat(64), data })));
  assert.throws(() => decodeBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /10 MB/);
  raw.close();
});

test('global search finds notes and labels across lists, filters projects and deduplicates file names', () => {
  const { searchPlanner } = load('src/tasks/search.ts');
  const lists = [{ id: 'one', title: 'Privat' }, { id: 'two', title: 'Ausgeblendet', isVisible: 0 }, { id: 'deleted', deletedLocally: 1 }];
  const task = { id: 't', title: 'Steuer', notes: 'Büro Dokument', project: 'Haus', tags: ['Finanzen'], checklist: [{ title: 'Belege' }] };
  const entry = { path: 'Belege/a.pdf', name: 'a.pdf', directory: false };
  const manifest = { folders: { Belege: { entries: [entry] } }, offline: { [entry.path]: { entry } } };
  const byList = { two: [task, { ...task, id: 'gone', deletedLocally: 1 }], deleted: [{ ...task, id: 'hidden' }] };
  assert.equal(searchPlanner(lists, byList, manifest, [], 'buro belege').tasks.length, 1);
  assert.equal(searchPlanner(lists, byList, manifest, [], 'a.pdf').documents.length, 1);
  assert.equal(searchPlanner(lists, byList, manifest, [], '', 'Haus', 'Finanzen').tasks.length, 1);
  assert.equal(searchPlanner(lists, byList, manifest, [], '', 'Haus').documents.length, 0);
  assert.equal(searchPlanner(lists, byList, manifest, [], '', 'Anderes').tasks.length, 0);
});

test('focus timer uses persisted end time across reloads, supports pause and never goes below zero', () => {
  const { parseFocus, remainingFocus } = load('src/tasks/focus.ts');
  const session = { taskId: 't', title: 'Steuer', duration: 1500, startedAt: 1000, endAt: 1501000, paused: null };
  const reloaded = parseFocus(JSON.stringify(session));
  assert.equal(remainingFocus(reloaded, 61000), 1440);
  assert.equal(remainingFocus(reloaded, 1801000), 0);
  assert.equal(remainingFocus({ ...session, endAt: null, paused: 120 }, 1801000), 120);
  assert.equal(remainingFocus({ ...session, duration: 0, endAt: null }, 1801000), null);
  assert.throws(() => parseFocus(JSON.stringify({ ...session, duration: -1 })));
});

test('monthly and yearly repetition keeps month-end and leap-day anchors', () => {
  const jan = new Date(2027, 0, 31, 12).toISOString();
  const feb = details.nextOccurrence(jan, { frequency: 'monthly', interval: 1 }, new Date(2027, 0, 31));
  assert.equal(new Date(feb.due).getDate(), 28);
  const march = details.nextOccurrence(feb.due, feb.recurrence, new Date(2027, 1, 28));
  assert.equal(new Date(march.due).getDate(), 31);
  const nextLeap = details.nextOccurrence(new Date(2024, 1, 29, 12).toISOString(), { frequency: 'yearly', interval: 4 }, new Date(2024, 1, 29));
  assert.equal(new Date(nextLeap.due).getDate(), 29);
});

test('weekday repetitions skip weekends and old missed dates without creating a backlog', () => {
  const next = details.nextOccurrence(new Date(2026, 9, 30, 12).toISOString(), { frequency: 'weekdays', interval: 1 }, new Date(2026, 10, 2));
  assert.equal(new Date(next.due).getDay(), 1);
  assert.equal(new Date(next.due).getDate(), 2);
  const daily = details.nextOccurrence(new Date(2020, 0, 1, 12).toISOString(), { frequency: 'daily', interval: 1 }, new Date(2026, 10, 2));
  assert.equal(new Date(daily.due).getFullYear(), 2026);
  assert.equal(new Date(daily.due).getDate(), 2);
  assert.throws(() => details.nextOccurrence(null, { frequency: 'weekly', interval: 0 }));
});

test('schema migration preserves legacy tasks and new metadata survives ordinary remote field updates', async () => {
  const { raw, repo } = await database();
  const checklist = [{ id: 'one', title: 'Ein Schritt', done: false }];
  await repo.updateTask('legacy', { checklist });
  raw.prepare("UPDATE tasks SET notes = ?, title = ? WHERE id = ?").run('Google-Notiz', 'Neuer Titel', 'legacy');
  const task = await repo.getTaskById('legacy');
  assert.equal(task.notes, 'Google-Notiz');
  assert.deepEqual(task.checklist, checklist);
  assert.equal(task.recurrence, null);
  raw.close();
});

test('completing a recurring task creates exactly one next task and resets its checklist', async () => {
  const { raw, repo } = await database();
  const due = new Date(); due.setDate(due.getDate() + 2);
  const attachments = [{ id: 'doc', configId: 'a'.repeat(64), path: 'Rechnungen/2026.pdf', name: '2026.pdf' }];
  await repo.updateTask('legacy', { recurrence: { frequency: 'weekly', interval: 1 }, due: due.toISOString(), checklist: [{ id: 'check', title: 'Prüfen', done: true }], attachments });
  await repo.toggleTaskStatus('legacy');
  await repo.updateTask('legacy', { status: 'completed' });
  assert.equal(await repo.materializeCompletedRepeats(), 0);
  const rows = await repo.getTasksByListId('list');
  assert.equal(rows.length, 2);
  const next = rows.find(task => task.id !== 'legacy');
  assert.equal(next.status, 'needsAction');
  assert.equal(next.checklist[0].done, false);
  assert.deepEqual(next.attachments, attachments);
  assert.ok(new Date(next.due) > due);
  await repo.toggleTaskStatus('legacy'); await repo.toggleTaskStatus('legacy');
  assert.equal((await repo.getTasksByListId('list')).length, 2);
  raw.prepare('DELETE FROM tasks WHERE id = ?').run(next.id);
  assert.equal(await repo.materializeCompletedRepeats(), 0);
  assert.equal((await repo.getTasksByListId('list')).length, 1);
  raw.close();
});

test('remote completion is materialized once, and invalid task details roll back atomically', async () => {
  const { raw, repo } = await database();
  await repo.updateTask('legacy', { recurrence: { frequency: 'daily', interval: 1 } });
  raw.exec("UPDATE tasks SET status='completed' WHERE id='legacy'");
  assert.equal(await repo.materializeCompletedRepeats(), 1);
  assert.equal(await repo.materializeCompletedRepeats(), 0);
  await assert.rejects(repo.updateTask('legacy', { title: 'Soll nicht gespeichert werden', attachments: [{ id: 'bad', configId: 'a'.repeat(64), path: '../secret', name: 'secret' }] }));
  assert.equal((await repo.getTaskById('legacy')).title, 'Vorhanden');
  raw.close();
});

test('Siri and capture receipts deduplicate across repeated delivery and task deletion', async () => {
  const { raw, repo } = await database();
  const one = await repo.captureTask('Milch kaufen', 'Notiz', null, 'siri:unique');
  const two = await repo.captureTask('Milch kaufen', 'Notiz', null, 'siri:unique');
  assert.equal(one, two);
  raw.prepare('DELETE FROM tasks WHERE id = ?').run(one);
  assert.equal(await repo.captureTask('Milch kaufen', 'Notiz', null, 'siri:unique'), one);
  assert.equal(await repo.getTaskById(one), null);
  raw.close();
});

test('capture creates an inbox when needed and never silently redirects a missing chosen list', async () => {
  const { raw, repo } = await database();
  await assert.rejects(repo.captureTask('Test', '', 'missing', 'one'), /Liste/);
  raw.exec('DELETE FROM tasks; DELETE FROM task_lists;');
  const id = await repo.captureTask('Neue Aufgabe', '', null, 'two');
  assert.ok(await repo.getTaskById(id));
  assert.equal(raw.prepare('SELECT title FROM task_lists').get().title, 'Eingang');
  raw.close();
});

test('shared links are kept as text without fetching URLs or importing local file URIs', () => {
  const { sharedDraft } = load('src/tasks/capture.ts');
  const draft = sharedDraft([{ shareType: 'url', value: 'https://example.test/a' }, { shareType: 'file', value: 'file:///private/secret' }]);
  assert.equal(draft.notes, 'https://example.test/a');
  assert.throws(() => sharedDraft([{ shareType: 'text', value: 'x'.repeat(20001) }]));
  const { redirectSystemPath } = load('app/+native-intent.ts');
  assert.equal(redirectSystemPath({ path: 'kanban-tasks://expo-sharing', initial: true }), '/capture?source=share');
  assert.equal(redirectSystemPath({ path: 'kanban-tasks:///?widget=today', initial: true }), 'kanban-tasks:///?widget=today');
});

function privacyFixture(preferences = { enabled: true, hideNotificationText: true }) {
  let result = { success: true }, finish;
  const saved = [];
  const { usePrivacyStore: store } = load('src/stores/usePrivacyStore.ts', {
    '../security/privacy': { readPrivacy: async () => { if (preferences instanceof Error) throw preferences; return preferences; }, savePrivacy: async value => saved.push(value) },
    'expo-local-authentication': { hasHardwareAsync: async () => true, isEnrolledAsync: async () => true, authenticateAsync: async () => result === 'pending' ? new Promise(resolve => { finish = resolve; }) : result },
  });
  return { store, saved, setResult: value => { result = value; }, finish: () => finish({ success: true }) };
}

test('privacy settings fail closed and canceled authentication never unlocks or disables the lock', async () => {
  const broken = privacyFixture(new Error('keychain unavailable'));
  await broken.store.getState().initialize();
  assert.equal(broken.store.getState().initialized, false);
  assert.equal(broken.store.getState().locked, true);
  const f = privacyFixture(); await f.store.getState().initialize(); f.setResult({ success: false });
  assert.equal(await f.store.getState().unlock(), false);
  await assert.rejects(f.store.getState().setEnabled(false));
  assert.equal(f.store.getState().enabled, true);
  assert.equal(f.saved.length, 0);
});

test('authentication completing after the app was locked again cannot reveal content', async () => {
  const f = privacyFixture(); await f.store.getState().initialize(); f.setResult('pending');
  const pending = f.store.getState().unlock();
  f.store.getState().lock(); f.finish();
  assert.equal(await pending, false);
  assert.equal(f.store.getState().locked, true);
});

test('private notifications contain no title or notes even if preference storage is unreadable', async () => {
  for (const value of [JSON.stringify({ enabled: true, hideNotificationText: true }), 'invalid json']) {
    const privacy = load('src/security/privacy.ts', { 'expo-secure-store': { getItemAsync: async () => value } });
    const content = await privacy.notificationText('Geheime Liste', 'Geheime Aufgabe');
    assert.equal(content.title, 'Planner'); assert.ok(!JSON.stringify(content).includes('Geheime'));
  }
});

test('redacting scheduled reminders preserves due time and removes original notification content', async () => {
  const scheduled = [], canceled = [];
  const date = new Date(Date.now() + 3600000).toISOString();
  const service = load('src/services/notifications.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    '../security/privacy': { notificationText: async () => ({ title: 'Planner', body: 'Verborgener Inhalt' }) },
    '../db/taskRepo': { getTaskById: async () => ({ status: 'needsAction', reminderAt: date }) },
    'expo-notifications': {
      setNotificationHandler() {}, SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
      getAllScheduledNotificationsAsync: async () => [
        { identifier: 'task-abc', content: { title: 'Geheim', body: 'Geheimer Titel', subtitle: 'Privat', data: { taskId: 'abc' } }, trigger: { type: 'timeInterval', seconds: 10000 } },
        { identifier: 'daily-briefing', content: { title: 'Privat' }, trigger: {} },
      ],
      scheduleNotificationAsync: async request => scheduled.push(request),
      cancelScheduledNotificationAsync: async id => canceled.push(id), dismissAllNotificationsAsync: async () => {},
    },
  });
  await service.redactExistingNotifications();
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].trigger.date.toISOString(), date);
  assert.equal(scheduled[1].trigger.hour, 8);
  assert.equal(scheduled[1].trigger.minute, 30);
  assert.ok(!JSON.stringify(scheduled).includes('Geheim'));
  assert.ok(!JSON.stringify(scheduled).includes('Privat'));
  assert.deepEqual(canceled, []);
});
