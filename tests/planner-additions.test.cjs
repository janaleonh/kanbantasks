const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createHash, randomUUID } = require('node:crypto');
const { create } = require('zustand');

function load(relative, mocks = {}, environment = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = id => id in mocks ? mocks[id] : id.startsWith('.') ? load(path.resolve(path.dirname(filename), `${id}.ts`), mocks, environment, cache) : require(id);
  new Function('exports', 'module', 'require', ...Object.keys(environment), code)(module.exports, module, localRequire, ...Object.values(environment));
  return module.exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const data = () => ({ createdAt: '2026-11-02T12:00:00.000Z', owner: null, lists: [], tasks: [], repeatReceipts: [] });

function backupFixture(corrupt = false) {
  const settings = new Map(), uploaded = [];
  const doc = create(() => ({ config: { id: 'nas' }, uploadBackup: async (source, id) => uploaded.push({ text: await source.body.text(), name: source.name, id }), readBackup: async () => corrupt ? uploaded[0].text.replace('2026-11-02', '2026-11-03') : uploaded[0].text }));
  const { useBackupStore: store } = load('src/stores/useBackupStore.ts', {
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_, text) => createHash('sha256').update(text).digest('hex'), randomUUID },
    '../db/database': { getSetting: async (key, fallback) => settings.get(key) ?? fallback, setSetting: async (key, value) => settings.set(key, value) },
    '../backup/database': { collectBackup: async () => data(), restoreBackup: async () => {} },
    './useDocumentStore': { useDocumentStore: doc }, './useKanbanStore': { useKanbanStore: create(() => ({})) },
  });
  return { store, doc, settings, uploaded };
}

test('NAS backup is confirmed only after read-back and checksum verification; tampering never advances last backup', async () => {
  const good = backupFixture();
  await good.store.getState().createBackup();
  assert.equal(good.uploaded.length, 1);
  assert.match(good.uploaded[0].name, /^Planner-backup-[a-z0-9-]+\.json$/i);
  assert.equal(good.uploaded[0].id, 'nas');
  assert.ok(good.settings.get('nasBackupAt:nas'));
  assert.deepEqual(await good.store.getState().parse(good.uploaded[0].text), data());
  const bad = backupFixture(true);
  await assert.rejects(bad.store.getState().createBackup(), /nicht bestätigt/);
  assert.equal(bad.settings.has('nasBackupAt:nas'), false);
  assert.equal(bad.store.getState().busy, false);
  assert.ok(bad.store.getState().error);
  await assert.rejects(good.store.getState().parse(good.uploaded[0].text.replace('2026-11-02', '2026-11-03')), /Prüfsumme/);
});

test('automatic backup waits for active, unlocked home access and a full day since the last backup', async () => {
  let attempts = 0, last = new Date().toISOString(), interval;
  const backup = create(() => ({ initialized: true, automatic: true, busy: false, initialize: async () => {}, createBackup: async () => { attempts++; } }));
  const doc = create(() => ({ config: { id: 'nas' }, home: false, saving: false, uploading: false, status: 'waiting' }));
  const privacy = create(() => ({ initialized: true, locked: false }));
  const board = create(() => ({ hasLoaded: true }));
  const app = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
  const { startAutomaticBackups } = load('src/backup/lifecycle.ts', {
    'react-native': { AppState: app }, '../db/database': { getSetting: async () => last },
    '../stores/useBackupStore': { useBackupStore: backup }, '../stores/useDocumentStore': { useDocumentStore: doc },
    '../stores/useKanbanStore': { useKanbanStore: board }, '../stores/usePrivacyStore': { usePrivacyStore: privacy },
  }, { setInterval: callback => { interval = callback; return 1; }, clearInterval() {} });
  const stop = startAutomaticBackups(); await tick();
  assert.equal(attempts, 0);
  doc.setState({ home: true }); await tick();
  assert.equal(attempts, 0);
  last = ''; privacy.setState({ locked: true }); interval(); await tick();
  assert.equal(attempts, 0);
  app.currentState = 'background'; privacy.setState({ locked: false }); await tick();
  assert.equal(attempts, 0);
  app.currentState = 'active'; interval(); await tick();
  assert.equal(attempts, 1);
  interval(); await tick(); assert.equal(attempts, 1);
  stop();
});

test('focus persists pause and resume and rejects completed tasks', async () => {
  const settings = new Map(), reminders = [];
  let now = 100000, status = 'needsAction';
  const { useFocusStore: store } = load('src/stores/useFocusStore.ts', {
    '../db/database': { getSetting: async (key, fallback) => settings.get(key) ?? fallback, setSetting: async (key, value) => settings.set(key, value) },
    '../db/taskRepo': { getTaskById: async () => ({ id: 'task', title: 'Lesen', status }) },
    '../services/notifications': { scheduleFocusTimerNotification: async (_, seconds) => reminders.push(seconds), cancelFocusTimerNotification: async () => {} },
  }, { Date: { now: () => now } });
  await store.getState().start('task', 25);
  assert.equal(JSON.parse(settings.get('focusSession')).endAt, now + 1500000);
  now += 60000;
  await store.getState().pause();
  assert.equal(store.getState().session.paused, 1440);
  now += 120000;
  await store.getState().resume();
  assert.equal(store.getState().session.endAt, now + 1440000);
  assert.equal(reminders.at(-1), 1440);
  await store.getState().end();
  assert.equal(settings.get('focusSession'), 'null');
  status = 'completed'; await assert.rejects(store.getState().start('task', 25), /offene Aufgabe/);
  assert.equal(store.getState().busy, false);
});

test('planner lock serializes recovery against synchronization and releases after errors', async () => {
  const { withPlannerLock } = load('src/db/plannerLock.ts');
  const order = []; let release;
  const first = withPlannerLock(async () => { order.push('sync'); await new Promise(resolve => { release = resolve; }); throw new Error('sync failed'); });
  const caught = first.catch(() => {});
  const second = withPlannerLock(async () => { order.push('restore'); });
  await tick(); assert.deepEqual(order, ['sync']);
  release(); await caught; await second;
  assert.deepEqual(order, ['sync', 'restore']);
});

function scannerFixture({ uri, canceled = false, failCommit = false, pdf = true } = {}) {
  const sourceUri = 'file:///cache/PlannerScans/12345678-1234-1234-1234-123456789abc.pdf';
  const files = new Map([[sourceUri, new TextEncoder().encode(pdf ? '%PDF-test' : 'not a pdf')]]), records = [];
  class File {
    constructor(...parts) { this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/'); }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length || 0; }
    readableStream() { return new ReadableStream({ start: controller => { controller.enqueue(files.get(this.uri)); controller.close(); } }); }
    copy(target) { files.set(target.uri, files.get(this.uri)); }
    delete() { files.delete(this.uri); }
  }
  const scanner = load('src/documents/scans.ts', {
    expo: { requireOptionalNativeModule: () => ({ scan: async () => ({ canceled, uri: uri || sourceUri, pages: 2 }) }) },
    'expo-file-system': { File, Directory: class { create() {} }, Paths: { cache: { uri: 'file:///cache' }, document: { uri: 'file:///docs' }, availableDiskSpace: 1000000000 } },
    '../db/database': { getDatabase: async () => ({ getAllAsync: async () => records, runAsync: async (_, values) => { if (failCommit) throw new Error('disk full'); records.push(values); } }) },
    '../utils/uuid': { generateUUID: randomUUID },
  });
  return { scanner, files, records, sourceUri };
}

test('scanner keeps a persistent PDF only after its database entry commits', async () => {
  const f = scannerFixture();
  const scan = await f.scanner.scanDocument();
  assert.equal(scan.pages, 2);
  assert.equal(f.records.length, 1);
  assert.equal(f.files.has(f.sourceUri), false);
  assert.equal(f.scanner.scanFile(scan.id).exists, true);
  const failed = scannerFixture({ failCommit: true });
  await assert.rejects(failed.scanner.scanDocument(), /disk full/);
  assert.deepEqual([...failed.files.keys()], [failed.sourceUri]);
});

test('scanner rejects foreign paths and non-PDF results; cancellation leaves no record', async () => {
  for (const uri of ['file:///docs/private.pdf', 'https://evil.test/a.pdf', 'file:///cache/PlannerScans/../private.pdf']) {
    const f = scannerFixture({ uri }); await assert.rejects(f.scanner.scanDocument(), /gültige PDF/); assert.equal(f.records.length, 0);
  }
  const invalid = scannerFixture({ pdf: false }); await assert.rejects(invalid.scanner.scanDocument(), /gültige PDF/);
  const canceled = scannerFixture({ canceled: true }); assert.equal(await canceled.scanner.scanDocument(), null);
  assert.equal(canceled.records.length, 0);
});

test('fixed folder sync keeps NAS-only files and uses a version check for changed iPhone files', async () => {
  class DavError extends Error { constructor(status) { super(); this.status = status; } }
  let hash = 'first', version = 'v1', remoteHash;
  const writes = [], settings = new Map([['iphone-folder:nas', JSON.stringify({ id:'link', folder:'Docs', bookmark:'access' })]]);
  class File {
    constructor(uri) { this.source = uri === 'snapshot'; }
    get md5() { return this.source ? hash : remoteHash; }
    get exists() { return true; }
    create() {} delete() {} writableStream() { return {}; }
  }
  const client = {
    ensureDirectory: async () => {}, stat: async () => { if (!version) throw new DavError(404); return { etag: version }; },
    download: async () => ({ etag: version }),
    upload: async (folder, source, signal, previous) => { writes.push([folder, source.name, previous]); remoteHash = hash; version ||= 'v2'; }
  };
  const { syncFolder } = load('src/documents/folderSync.ts', {
    './webdav': { DavError },
    expo: { requireOptionalNativeModule: () => ({ entries: async () => [{path:'a.pdf',kind:'file'}], snapshot: async () => 'snapshot' }) },
    'expo-file-system': { File, Paths:{cache:'cache'} }, 'react-native': { AppState:{currentState:'active'} },
    '../db/database': { getSetting: async (k,d) => settings.get(k) ?? d, setSetting: async (k,v) => settings.set(k,v) },
    '../stores/useDocumentStore': { useDocumentStore:{getState:()=>({config:{id:'nas'}})}, nasWrite: async (_,fn)=>fn({client, signal:new AbortController().signal, assert() {}}) },
    '../stores/usePrivacyStore': { usePrivacyStore:{getState:()=>({initialized:true, locked:false})} },
    '../utils/uuid': { generateUUID: randomUUID },
  });
  await syncFolder(); await syncFolder(); hash = 'changed'; await syncFolder();
  assert.deepEqual(writes, [['Docs','a.pdf',undefined], ['Docs','a.pdf','v1']]);
  version = 'remote-edit';
  await syncFolder();
  assert.equal(writes.length, 2);
  version = null;
  await syncFolder();
  assert.deepEqual(writes[2], ['Docs','a.pdf',undefined]);
});
