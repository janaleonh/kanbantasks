const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative, mocks = {}, environment = {}) {
  const filename = path.join(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const localRequire = id => id in mocks ? mocks[id] : id.startsWith('.') ? load(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`)), mocks, environment) : require(id);
  new Function('exports', 'module', 'require', ...Object.keys(environment), source)(module.exports, module, localRequire, ...Object.values(environment));
  return module.exports;
}

function fixture(options = {}) {
  const lists = [{ id: 'a', title: 'Arbeit', isVisible: true }];
  const tasks = { a: [{ id: 'task', title: 'Aufgabe', listId: 'a', status: 'needsAction', due: new Date().toISOString(), localPosition: 0 }] };
  let state = { taskLists: options.empty ? [] : lists, tasksByList: options.empty ? {} : tasks, hasLoaded: options.loaded !== false, isLoading: false, error: null };
  const status = {};
  const listeners = new Set(), timers = new Map();
  let tick = 0, loads = 0, appListener, imports = 0;
  const replace = patch => { const previous = state; state = { ...state, ...patch }; for (const listener of listeners) listener(state, previous); };
  state.loadAll = async () => { loads++; replace({ taskLists: options.empty ? [] : lists, tasksByList: options.empty ? {} : tasks, hasLoaded: true }); };
  function widget() {
    let stored = [];
    return { calls: [], updateTimeline(entries) { this.calls.push(entries); stored = entries; }, async getTimeline() { if (options.beforeRead) await options.beforeRead(state, replace); return options.badWrite ? [] : options.staleTitle ? stored.map((entry,i) => i === 2 ? {...entry,props:{...entry.props,tasks:entry.props.tasks.map(t=>({...t,title:'Alter Titel'}))}} : entry) : stored; } };
  }
  const today = widget(), overview = widget();
  const service = load('src/widgets/syncWidgets.ts', {
    'react-native': { Platform: { OS: 'ios' }, AppState: { addEventListener: (_, callback) => { appListener = callback; return { remove() {} }; } } },
    'expo-constants': { __esModule: true, default: { executionEnvironment: options.expoGo ? 'store' : 'standalone' }, ExecutionEnvironment: { StoreClient: 'store' } },
    expo: { requireOptionalNativeModule: () => options.noNative ? null : { widgetsDirectory: options.noGroup ? null : 'file:///shared/widgets/' } },
    '../stores/useKanbanStore': { useKanbanStore: { getState: () => state, subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); } } },
    './status': { useWidgetStatus: { setState: patch => Object.assign(status, patch) } },
    './TodayTasks': { __esModule: true, get default() { imports++; return today; } },
    './TasksOverview': { __esModule: true, get default() { imports++; return overview; } },
  }, { setTimeout: callback => { const id = ++tick; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id) });
  return { service, state, status, today, overview, replace, get loads() { return loads; }, get imports() { return imports; }, fireApp: () => appListener('active'), fireTimers: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); } };
}

test('cold launch outside Board hydrates tasks and publishes both timelines', async () => {
  const f = fixture({ loaded: false });
  assert.equal(await f.service.refreshWidgets(), true);
  assert.equal(f.loads, 1);
  assert.equal(f.today.calls[0][0].props.count, 1);
  assert.equal(f.overview.calls[0][0].props.count, 1);
  assert.equal(f.today.calls[0].length, 8);
  assert.equal(f.status.state, 'updated');
});

test('an empty hydrated board replaces the initial placeholder with a truthful zero', async () => {
  const f = fixture({ empty: true, loaded: false });
  await f.service.refreshWidgets();
  assert.equal(f.overview.calls[0][0].props.count, 0);
  assert.equal(f.overview.calls[0][0].props.hasData, true);
  assert.equal(f.status.state, 'updated');
});

test('missing App Group access is reported and never mistaken for successful delivery', async () => {
  const f = fixture({ noGroup: true });
  assert.equal(await f.service.refreshWidgets(), false);
  assert.equal(f.status.state, 'blocked');
  assert.equal(f.imports, 0);
  assert.equal(f.loads, 0);
});

test('Expo Go and builds without widgets never import native widget definitions', async () => {
  for (const options of [{ expoGo: true }, { noNative: true }]) {
    const f = fixture(options);
    assert.equal(await f.service.refreshWidgets(), false);
    assert.equal(f.status.state, 'unavailable');
    assert.equal(f.imports, 0);
  }
});

test('a failed native write is shown as an error instead of reporting synchronized widgets', async () => {
  const f = fixture({ badWrite: true });
  assert.equal(await f.service.refreshWidgets(), false);
  assert.equal(f.status.state, 'error');
});

test('task edits during a pending write are published in a following timeline', async () => {
  let changed = false;
  const f = fixture({ beforeRead: (state, replace) => {
    if (!changed) { changed = true; replace({ tasksByList: { a: [] } }); }
  } });
  await f.service.refreshWidgets();
  assert.equal(f.overview.calls.length, 2);
  assert.equal(f.overview.calls.at(-1)[0].props.count, 0);
});

test('foreground refresh and subsequent store edits republish current data', async () => {
  const f = fixture();
  const stop = f.service.startWidgetSync();
  await f.service.refreshWidgets();
  f.replace({ tasksByList: { a: [] } }); f.fireTimers();
  await f.service.refreshWidgets();
  assert.equal(f.overview.calls.at(-1)[0].props.count, 0);
  const previous = f.overview.calls.length;
  f.fireApp(); await f.service.refreshWidgets();
  assert.ok(f.overview.calls.length > previous);
  stop();
});

test('matching counts cannot hide stale task titles in a later widget entry', async () => {
  const f = fixture({staleTitle:true});
  assert.equal(await f.service.refreshWidgets(),false);
  assert.equal(f.status.state,'error');
});
