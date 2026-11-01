const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative, mocks = {}, globals = {}) {
  const filename = path.join(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const localRequire = id => id in mocks ? mocks[id] : id.startsWith('.') ? load(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`)), mocks, globals) : require(id);
  new Function('exports', 'module', 'require', ...Object.keys(globals), source)(module.exports, module, localRequire, ...Object.values(globals));
  return module.exports;
}

function accounts() {
  const settings = new Map();
  const guard = load('src/auth/taskAccount.ts', { '../db/database': {
    getSetting: async (key, fallback) => settings.get(key) ?? fallback,
    setSetting: async (key, value) => settings.set(key, value),
  } });
  return { guard, settings };
}

function authentication(fetch, more = {}) {
  const values = new Map([
    ['google_user_email', 'a@example.test'], ['google_user_name', 'A'],
    ['google_access_token', 'old-token'], ['google_refresh_token', 'old-refresh'], ['google_expires_at', '0'],
  ]);
  const { guard, settings } = accounts();
  const auth = load('src/auth/googleAuth.ts', {
    'expo-auth-session': more, 'expo-web-browser': { maybeCompleteAuthSession() {} },
    './taskAccount': guard,
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device',
      getItemAsync: async key => values.get(key) ?? null,
      setItemAsync: async (key, value) => values.set(key, value),
      deleteItemAsync: async key => values.delete(key),
    },
  }, { fetch });
  return { auth, values, settings };
}

test('task ownership survives logout and refuses another account without reassigning data', async () => {
  const { guard, settings } = accounts();
  await guard.requireTaskAccount(' A@Example.Test ');
  await guard.requireTaskAccount('a@example.test');
  await assert.rejects(guard.requireTaskAccount('b@example.test'), /anderen Google-Konto/);
  await assert.rejects(guard.requireTaskAccount(null), /verifizierten/);
  assert.equal(settings.get('googleTasksOwner'), 'a@example.test');
});

test('a refresh response after logout cannot restore tokens or return a valid session', async () => {
  let finish, began;
  const started = new Promise(resolve => { began = resolve; });
  const { auth, values, settings } = authentication(() => new Promise(resolve => { began(); finish = () => resolve(new Response(JSON.stringify({ access_token: 'late-token', expires_in: 3600 }))); }));
  const pending = auth.getValidAccessToken();
  await started; await auth.clearTokens(); finish();
  assert.equal(await pending, null);
  assert.equal(await auth.loadTokens(), null);
  assert.equal(values.has('google_access_token'), false);
  assert.equal(settings.get('googleTasksOwner'), 'a@example.test');
});

test('a late OAuth exchange cannot sign in again after logout', async () => {
  let finish, began;
  const started = new Promise(resolve => { began = resolve; });
  const { auth } = authentication(async () => {}, { exchangeCodeAsync: () => new Promise(resolve => { began(); finish = () => resolve({ accessToken: 'late', expiresIn: 3600 }); }) });
  const pending = auth.exchangeCodeForTokens('code', 'verifier', 'redirect');
  await started; await auth.clearTokens(); finish();
  await assert.rejects(pending, /Anmeldung wurde geändert/);
  assert.equal(await auth.loadTokens(), null);
});

test('new login blocks APIs until Google verifies identity and preserves the previous task owner', async () => {
  const { auth, settings } = authentication(async () => new Response(JSON.stringify({ email: 'b@example.test', email_verified: true, name: 'B' })));
  await auth.saveTokens({ accessToken: 'new-token', refreshToken: null, expiresAt: Date.now() + 3600000 });
  assert.equal(await auth.getValidAccessToken(), null);
  await auth.fetchUserInfo('new-token');
  assert.equal(await auth.getValidAccessToken(), 'new-token');
  assert.equal(settings.get('googleTasksOwner'), 'a@example.test');
});

test('userinfo arriving after logout cannot restore the cached account', async () => {
  let finish;
  const { auth } = authentication(() => new Promise(resolve => { finish = () => resolve(new Response(JSON.stringify({ email: 'b@example.test', email_verified: true }))); }));
  const pending = auth.fetchUserInfo('token');
  await auth.clearTokens(); finish();
  await assert.rejects(pending, /Anmeldung wurde geändert/);
  assert.equal(await auth.loadCachedUser(), null);
});

test('unverified identity cannot enable API access', async () => {
  const { auth } = authentication(async () => new Response(JSON.stringify({ email: 'b@example.test', email_verified: false })));
  await auth.saveTokens({ accessToken: 'new-token', refreshToken: null, expiresAt: Date.now() + 3600000 });
  await assert.rejects(auth.fetchUserInfo('new-token'), /nicht eindeutig/);
  assert.equal(await auth.getValidAccessToken(), null);
});

test('task APIs encode remote identifiers and pagination tokens, and never expose response bodies as errors', async () => {
  const requests = [];
  let failure = false;
  const api = load('src/sync/googleTasksApi.ts', {
    '../auth/googleAuth': { getAuthVersion: () => 0, loadCachedUser: async () => ({ email: 'a@example.test' }), getValidAccessToken: async () => 'token' },
    '../auth/taskAccount': { requireTaskAccount: async () => {} },
  }, { fetch: async (url, options) => {
    requests.push({ url, options });
    if (failure) return new Response('private response data', { status: 500 });
    return new Response(JSON.stringify(requests.length === 1 ? { items: [], nextPageToken: 'x&other=secret' } : { items: [] }));
  } });
  await api.fetchAllTasks('a/b?extra');
  assert.ok(requests[0].url.includes('/lists/a%2Fb%3Fextra/tasks?'));
  assert.ok(requests[1].url.endsWith('pageToken=x%26other%3Dsecret'));
  failure = true;
  await assert.rejects(api.createRemoteTaskList('Private title'), error => error.message === 'API_ERROR 500');
});

test('task sync checks account ownership before any local cleanup or Google request', async () => {
  let accessed = false;
  const { runSync } = load('src/sync/syncEngine.ts', {
    '../auth/googleAuth': { loadCachedUser: async () => ({ email: 'b@example.test' }) },
    '../auth/taskAccount': { requireTaskAccount: async () => { throw new Error('account mismatch'); } },
    '../db/database': { getDatabase: async () => { accessed = true; } },
    '../db/taskListRepo': {}, './googleTasksApi': {}, '../utils/uuid': {},
  });
  assert.deepEqual((await runSync()).errors, ['account mismatch']);
  assert.equal(accessed, false);
});

test('separate tasks with matching text and different due dates survive a full sync', async () => {
  const tasks = [
    { id: 'local-1', remoteId: 'remote-1', listId: 'list', title: 'Repeat', notes: '', status: 'needsAction', due: '2026-11-02', syncStatus: 'synced', updatedAt: '2026-11-01', deletedLocally: 0 },
    { id: 'local-2', remoteId: 'remote-2', listId: 'list', title: 'Repeat', notes: '', status: 'needsAction', due: '2026-11-03', syncStatus: 'synced', updatedAt: '2026-11-01', deletedLocally: 0 },
  ];
  const list = { id: 'list', remoteId: 'remote-list', syncStatus: 'synced', updatedAt: '2026-11-01', deletedLocally: 0 };
  const removed = [];
  const db = {
    runAsync: async (sql, args = []) => { if (/DELETE FROM tasks|SET deletedLocally = 1/.test(sql)) removed.push(args); },
    getFirstAsync: async () => null,
    getAllAsync: async sql => {
      if (sql.includes('GROUP BY listId, title')) return [{ listId: 'list', title: 'Repeat', notes: '', status: 'needsAction', cnt: 2 }];
      if (sql.includes('WHERE listId = ? AND title')) return tasks;
      if (sql.includes('GROUP BY remoteId')) return [];
      if (sql.includes('SELECT * FROM task_lists')) return [list];
      if (sql.includes('previousListId IS NOT NULL')) return [];
      if (sql.includes('SELECT * FROM tasks')) return tasks;
      return [];
    },
  };
  const { runSync } = load('src/sync/syncEngine.ts', {
    '../auth/googleAuth': { loadCachedUser: async () => ({ email: 'a@example.test' }) },
    '../auth/taskAccount': { requireTaskAccount: async () => {} },
    '../db/database': { getDatabase: async () => db },
    '../db/taskListRepo': { getAllTaskLists: async () => [list] },
    './googleTasksApi': { fetchAllTaskLists: async () => [{ id: 'remote-list' }], fetchAllTasks: async () => tasks.map(task => ({ ...task, id: task.remoteId, updated: task.updatedAt })) },
    '../utils/uuid': {},
  });
  assert.deepEqual((await runSync()).errors, []);
  assert.deepEqual(removed, []);
});
