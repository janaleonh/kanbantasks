const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadSource(relative, mocks = {}, environment = {}) {
  const filename = path.join(__dirname, '..', relative);
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  const localRequire = (id) => id in mocks ? mocks[id] : id.startsWith('.') ? loadSource(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`)), mocks, environment) : require(id);
  new Function('exports', 'module', 'require', ...Object.keys(environment), result.outputText)(module.exports, module, localRequire, ...Object.values(environment));
  return module.exports;
}
const paths = loadSource('src/documents/paths.ts');
const { uploadPath, validateUpload } = loadSource('src/documents/upload.ts');
const { WebDavClient, parseMultiStatus } = loadSource('src/documents/webdav.ts');
const config = { id: 'a'.repeat(64), server: 'https://nas.example.test:5006', root: '/home/Drive/Wichtig', username: 'tester', homeNetwork: '192.168.178.0/24', autoSync: true };
const entry = (path, extra = {}) => ({ path, name: path.split('/').at(-1), directory: false, size: 3, modified: '2026-11-01T10:00:00.000Z', etag: '"v1"', mimeType: 'application/pdf', ...extra });
const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const responseXML = (item) => `<D:response><D:href>${xmlEscape(paths.remoteUrl(config, item.path, item.directory))}</D:href><D:propstat><D:prop><D:resourcetype>${item.directory ? '<D:collection/>' : ''}</D:resourcetype><D:getcontentlength>${item.size ?? ''}</D:getcontentlength><D:getcontenttype>${item.mimeType}</D:getcontenttype><D:getetag>${xmlEscape(item.etag || '')}</D:getetag><D:getlastmodified>Sun, 01 Nov 2026 10:00:00 GMT</D:getlastmodified></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
const multistatus = (items) => `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:">${items.map(responseXML).join('')}</D:multistatus>`;

test('backup directory creation requires a new collection or verifies an existing directory', async () => {
  const calls = [];
  const created = new WebDavClient(config, 'test', async (url, options) => { calls.push({ url, options }); return new Response(null, { status: 201 }); });
  await created.ensureDirectory('Planner-Backups', new AbortController().signal);
  assert.equal(calls[0].options.method, 'MKCOL');
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].url.endsWith('/Planner-Backups/'));
  const existing = directory => new WebDavClient(config, 'test', async (_, options) => options.method === 'MKCOL' ? new Response(null, { status: 405 }) : new Response(multistatus([entry('Planner-Backups', { directory })]), { status: 207 }));
  await existing(true).ensureDirectory('Planner-Backups', new AbortController().signal);
  await assert.rejects(existing(false).ensureDirectory('Planner-Backups', new AbortController().signal));
});

test('NAS configuration accepts HTTPS and bounded home networks, never embedded credentials or traversal', () => {
  assert.equal(paths.normalizeInput({ ...config, root: '/home//Drive/Wichtig/', homeNetwork: '192.168.178.25/24' }).homeNetwork, '192.168.178.0/24');
  assert.equal(paths.normalizeInput({ ...config }).root, config.root);
  for (const server of ['http://nas.local:5005', 'https://user:password@nas.local', 'https://nas.local/api?secret=1']) assert.throws(() => paths.normalizeServer(server));
  for (const root of ['../private', '/home/../private', '/home\\private']) assert.throws(() => paths.safeSegments(root));
  for (const network of ['0.0.0.0/0', '8.8.0.0/16', '192.168.0.0/8', '192.168.999.0/24']) assert.throws(() => paths.normalizeNetwork(network));
  assert.equal(paths.detectedNetwork('192.178.141.55', '255.255.255.0'), '192.178.141.0/24');
  assert.equal(paths.networkMatches('192.178.141.55', '192.178.141.0/24'), true);
  assert.equal(paths.networkMatches('192.178.142.55', '192.178.141.0/24'), false);
});

test('home detection rejects mobile data and other Wi-Fi ranges without needing an internet connection', () => {
  const { isHomeNetwork } = loadSource('src/documents/network.ts', { '@react-native-community/netinfo': {} });
  assert.equal(isHomeNetwork({ type: 'wifi', isConnected: true, isInternetReachable: false, details: { ipAddress: '192.168.178.12' } }, config), true);
  assert.equal(isHomeNetwork({ type: 'cellular', isConnected: true, details: { ipAddress: '192.168.178.12' } }, config), false);
  assert.equal(isHomeNetwork({ type: 'wifi', isConnected: true, details: { ipAddress: '192.168.1.12' } }, config), false);
  assert.equal(isHomeNetwork({ type: 'wifi', isConnected: true, details: { ipAddress: null } }, config), false);
  assert.equal(paths.detectedNetwork('192.168.178.12', '255.255.255.0'), '192.168.178.0/24');
  assert.throws(() => paths.detectedNetwork('192.168.178.12', '255.0.255.0'));
});

test('WebDAV namespaces, Unicode names and empty collections are parsed without treating the folder itself as a child', () => {
  const entries = parseMultiStatus(multistatus([entry('', { directory: true }), entry('Unterlagen', { directory: true }), entry('Übersicht & Plan.pdf')]), config, '');
  assert.deepEqual(entries.map((e) => e.path), ['Unterlagen', 'Übersicht & Plan.pdf']);
  assert.equal(entries[0].directory, true);
  assert.equal(entries[1].etag, '"v1"');
  assert.equal(entries[1].size, 3);
  assert.deepEqual(parseMultiStatus(multistatus([entry('', { directory: true })]), config, ''), []);
});

test('foreign origins, sibling roots, encoded traversal and XML entity expansion cannot enter the file list', () => {
  for (const href of ['https://evil.example/doc.pdf', '/home/Drive/Wichtig2/file.pdf', '/home/Drive/Wichtig/%2e%2e/secret.pdf', '/home/Drive/Wichtig/x%2f..%2fsecret', '/home/Drive/Wichtig/a%5Cb', 'https://user:secret@nas.example.test:5006/home/Drive/Wichtig/a']) assert.equal(paths.relativeHref(href, config, ''), null);
  assert.equal(paths.relativeHref('/home/Drive/Wichtig/normal.pdf', config, ''), 'normal.pdf');
  assert.throws(() => parseMultiStatus('<!DOCTYPE x [<!ENTITY e "boom">]><multistatus/>', config, ''));
  const nested = parseMultiStatus(multistatus([entry('folder/child.pdf')]), config, '');
  assert.equal(nested.length, 0);
});

test('failed property sets are ignored rather than overwriting valid properties', () => {
  const xml = multistatus([entry('a.pdf')]).replace('</D:response>', '<D:propstat><D:prop><D:getetag>bad</D:getetag></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat></D:response>');
  assert.equal(parseMultiStatus(xml, config, '')[0].etag, '"v1"');
});

test('folder listing uses UTF-8 Basic auth, depth 1 and blocked redirects', async () => {
  const calls = [];
  const transport = async (url, options) => { calls.push({ url, options }); return new Response(multistatus([entry('a.pdf')]), { status: 207 }); };
  const client = new WebDavClient(config, 'päss:wort', transport);
  const files = await client.list('', new AbortController().signal);
  assert.equal(files.length, 1);
  assert.equal(calls[0].options.method, 'PROPFIND');
  assert.equal(calls[0].options.headers.Depth, '1');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(Buffer.from(calls[0].options.headers.Authorization.slice(6), 'base64').toString('utf8'), 'tester:päss:wort');
  assert.ok(calls[0].url.endsWith('/Wichtig/'));
});

test('upload names cannot escape the selected folder or inject paths and headers', () => {
  assert.equal(uploadPath('Privat', 'Vertrag #1 %.pdf'), 'Privat/Vertrag #1 %.pdf');
  for (const name of ['', '.', '..', '../secret', 'a/b', 'a\\b', 'a:b', 'a\r\nb', 'x\0', 'x.', 'x ', '@eaDir', 'ä'.repeat(128)]) {
    assert.throws(() => uploadPath('Privat', name), name);
  }
  assert.throws(() => uploadPath('../secret', 'a.pdf'));
  assert.throws(() => validateUpload({ name: 'a.pdf', size: 4, body: new Blob(['abc']) }));
  assert.throws(() => validateUpload({ name: 'a.pdf', size: 50 * 1024 * 1024 + 1, body: { size: 50 * 1024 * 1024 + 1 } }));
});

test('uploads use raw PUT, a create-only precondition, fixed MIME type and no redirects', async () => {
  let requested;
  const body = new Blob(['abc']);
  const client = new WebDavClient(config, 'test', async (url, options) => { requested = { url, options }; return new Response(null, { status: 201 }); });
  assert.equal(await client.upload('Privat', { name: 'Vertrag #1 %.pdf', size: 3, body }, new AbortController().signal), 'Privat/Vertrag #1 %.pdf');
  assert.equal(requested.url, `${config.server}${config.root}/Privat/Vertrag%20%231%20%25.pdf`);
  assert.equal(requested.options.method, 'PUT');
  assert.equal(requested.options.body, body);
  assert.equal(requested.options.headers['If-None-Match'], '*');
  assert.equal(requested.options.headers['Content-Type'], 'application/octet-stream');
  assert.equal(requested.options.redirect, 'error');
  assert.equal(requested.options.credentials, 'omit');
});

test('upload conflicts, missing write permission, redirects and ambiguous success are rejected without retries', async () => {
  for (const [status, pattern] of [[412, /existiert bereits/], [403, /Schreibrechte/], [409, /Zielordner/], [507, /Speicher/], [302, /Weiterleitungen/], [200, /nicht eindeutig/], [204, /nicht eindeutig/]]) {
    let calls = 0;
    const client = new WebDavClient(config, 'test', async () => { calls++; return new Response(null, { status }); });
    await assert.rejects(client.upload('', { name: 'a.pdf', size: 3, body: new Blob(['abc']) }, new AbortController().signal), pattern);
    assert.equal(calls, 1);
  }
});

test('invalid or canceled uploads never send credentials or bytes; network failures are not retried', async () => {
  let calls = 0;
  const client = new WebDavClient(config, 'test', async () => { calls++; throw new Error('network lost'); });
  const source = { name: 'a.pdf', size: 3, body: new Blob(['abc']) };
  await assert.rejects(client.upload('', { ...source, name: '../a' }, new AbortController().signal));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.upload('', source, controller.signal), /beendet/);
  assert.equal(calls, 0);
  await assert.rejects(client.upload('', source, new AbortController().signal), /nicht bestätigt/);
  assert.equal(calls, 1);
});

test('file metadata is queried through its parent rather than adding a slash to a file URL', async () => {
  let requested;
  const client = new WebDavClient(config, 'test', async (url) => { requested = url; return new Response(multistatus([entry('a.pdf')]), { status: 207 }); });
  assert.equal((await client.stat('a.pdf', new AbortController().signal)).path, 'a.pdf');
  assert.ok(requested.endsWith('/Wichtig/'));
});

test('downloads stream the exact file and include etag preconditions', async () => {
  const chunks = []; let options;
  const client = new WebDavClient(config, 'test', async (_, init) => { options = init; return new Response(new Uint8Array([1, 2, 3]), { headers: { etag: '"v1"', 'content-length': '3' } }); });
  const metadata = await client.download(entry('a.pdf'), new WritableStream({ write: (chunk) => { chunks.push(...chunk); } }), new AbortController().signal);
  assert.deepEqual(chunks, [1, 2, 3]);
  assert.equal(metadata.size, 3);
  assert.equal(options.method, 'GET');
  assert.equal(options.headers['If-Match'], '"v1"');
});

test('truncated and oversized downloads abort their destination instead of committing a partial copy', async () => {
  let aborted = false, closed = false;
  const client = new WebDavClient(config, 'test', async () => new Response(new Uint8Array([1, 2])));
  await assert.rejects(client.download(entry('a.pdf'), new WritableStream({ abort: () => { aborted = true; }, close: () => { closed = true; } }), new AbortController().signal), /unvollständig/);
  assert.equal(aborted, true); assert.equal(closed, false);
  const large = new WebDavClient(config, 'test', async () => new Response(new Uint8Array([1, 2, 3, 4])));
  await assert.rejects(large.download(entry('a.pdf', { size: null }), new WritableStream(), new AbortController().signal, 3), /Limit/);
});

test('authentication failures and redirects are surfaced without following another host', async () => {
  const client = new WebDavClient(config, 'test', async () => new Response('', { status: 401 }));
  await assert.rejects(client.list('', new AbortController().signal), (error) => error.status === 401);
  const redirect = new WebDavClient(config, 'test', async () => new Response('', { status: 302, headers: { location: 'https://evil.example' } }));
  await assert.rejects(redirect.list('', new AbortController().signal), /Weiterleitungen/);
});

function storeFixture(initial, options = {}) {
  const files = new Map(options.existing ? Object.entries(options.existing) : []);
  const saved = [];
  const requests = [];
  let number = 0;
  let home = options.home !== false;
  class HomeNetworkError extends Error {}
  const remote = options.remote || [entry('a.pdf')];
  const transport = async (url, request) => {
    requests.push({ url, request });
    if (request.method === 'PUT') return options.put ? options.put(url, request) : new Response(null, { status: 201 });
    if (request.method === 'PROPFIND') {
      const relative = paths.relativeHref(url, config, '');
      const children = remote.filter((entry) => paths.parentPath(entry.path) === (relative || ''));
      return new Response(multistatus(children), { status: 207 });
    }
    return new Response(options.bytes || new Uint8Array([1, 2, 3]), { headers: { etag: '"v2"' } });
  };
  const storage = {
    clearTransientCopies() {},
    loadConnection: async () => ({ config, password: 'test-only' }),
    loadManifest: async () => JSON.parse(JSON.stringify(initial)),
    saveManifest: async (_, manifest) => { if (options.failCommit && Object.values(manifest.offline).some((record) => record.fileKey.startsWith('new-'))) throw new Error('disk write failed'); saved.push(JSON.parse(JSON.stringify(manifest))); },
    cachedFile: (_, key) => ({ exists: files.has(key) }),
    removeCachedFile: (_, key) => files.delete(key),
    leaseCachedFile: (_, key) => ({ uri: `file:///${key}`, release() {}, retain: () => () => {} }),
    downloadCopy: async (client, config, entry, signal, offline, limit) => {
      if (options.download) return options.download(files, entry);
      const metadata = await client.download(entry, new WritableStream(), signal, limit);
      const fileKey = `new-${++number}`; files.set(fileKey, true);
      return { entry: { ...entry, ...metadata }, fileKey, uri: `file:///${fileKey}` };
    },
    clearNasStorage: async () => files.clear(),
  };
  const { useDocumentStore: store } = loadSource('src/stores/useDocumentStore.ts', {
    'expo/fetch': { fetch: transport },
    '../documents/storage': storage,
    '../documents/network': { HomeNetworkError, requireHomeNetwork: async () => { if (!home) throw new HomeNetworkError('not home'); } },
  });
  return { store, files, saved, requests, setHome: (value) => { home = value; store.getState().setHome(value); } };
}
const manifest = (more = {}) => ({ favorites: [{ path: 'a.pdf', name: 'a.pdf', directory: false }], folders: {}, offline: {}, lastSyncAt: null, ...more });
const oldRecord = { entry: entry('a.pdf', { etag: '"old"' }), fileKey: 'old', downloadedAt: '2026-10-31', missing: false };

test('uploads are blocked outside home and after switching NAS configuration', async () => {
  const fixture = storeFixture(manifest(), { home: false });
  await fixture.store.getState().initialize();
  const source = { name: 'b.pdf', size: 3, body: new Blob(['abc']) };
  await assert.rejects(fixture.store.getState().uploadFile('', source, config.id));
  await assert.rejects(fixture.store.getState().uploadFile('', source, 'different'), /geändert/);
  assert.equal(fixture.requests.length, 0);
  assert.equal(fixture.store.getState().uploading, false);
});

test('a confirmed upload refreshes its folder, leaving offline favorites intact', async () => {
  const fixture = storeFixture(manifest({ offline: { 'a.pdf': oldRecord } }));
  await fixture.store.getState().initialize();
  await fixture.store.getState().uploadFile('', { name: 'b.pdf', size: 3, body: new Blob(['abc']) }, config.id);
  assert.deepEqual(fixture.requests.map(({ request }) => request.method), ['PUT', 'PROPFIND']);
  assert.equal(fixture.store.getState().manifest.offline['a.pdf'].fileKey, 'old');
  assert.equal(fixture.store.getState().uploading, false);
});

test('backup uploads and reads remain bound to the home network, configured NAS and fixed backup folder', async () => {
  const fixture = storeFixture(manifest(), { home: false });
  await fixture.store.getState().initialize();
  const source = { name: 'Planner-backup-test.json', size: 2, body: new Blob(['{}']) };
  await assert.rejects(fixture.store.getState().uploadBackup(source, config.id));
  await assert.rejects(fixture.store.getState().readBackup('Planner-Backups/Planner-backup-test.json', config.id));
  await assert.rejects(fixture.store.getState().uploadBackup(source, 'different'), /geändert/);
  assert.equal(fixture.requests.length, 0);
  fixture.setHome(true);
  await assert.rejects(fixture.store.getState().readBackup('../secret.json', config.id), /Ungültige/);
  await assert.rejects(fixture.store.getState().uploadBackup({ ...source, name: '../secret.json' }, config.id));
  assert.equal(fixture.requests.length, 0);
});

test('disconnect aborts uploads and late replies cannot restore removed state', async () => {
  let finish, started;
  const began = new Promise(resolve => { started = resolve; });
  const fixture = storeFixture(manifest(), { put: () => new Promise(resolve => { started(); finish = () => resolve(new Response(null, { status: 201 })); }) });
  await fixture.store.getState().initialize();
  const upload = fixture.store.getState().uploadFile('', { name: 'b.pdf', size: 3, body: new Blob(['abc']) }, config.id);
  await began;
  await assert.rejects(fixture.store.getState().uploadFile('', { name: 'c.pdf', size: 3, body: new Blob(['abc']) }, config.id), /warte/);
  await fixture.store.getState().disconnect();
  assert.equal(fixture.requests[0].request.signal.aborted, true);
  finish(); await assert.rejects(upload, /NAS hat die Datei gespeichert/);
  assert.equal(fixture.store.getState().config, null);
  assert.equal(fixture.store.getState().uploading, false);
  assert.equal(fixture.requests.length, 1);
});

test('losing the home network aborts an upload without retrying it', async () => {
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const fixture = storeFixture(manifest(), { put: (_, request) => new Promise((_, reject) => {
    began(); request.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  await fixture.store.getState().initialize();
  fixture.setHome(true);
  const uploading = fixture.store.getState().uploadFile('', { name: 'b.pdf', size: 3, body: new Blob(['abc']) }, config.id);
  await started; fixture.setHome(false);
  await assert.rejects(uploading, /nicht bestätigt/);
  assert.equal(fixture.store.getState().uploading, false);
  assert.equal(fixture.requests.length, 1);
});

test('Google tokens are saved only in the unlocked device-bound keychain', async () => {
  const saved = [];
  const auth = loadSource('src/auth/googleAuth.ts', {
    'expo-auth-session': {}, 'expo-web-browser': { maybeCompleteAuthSession() {} },
    './taskAccount': { rememberTaskAccount: async () => {} },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only', getItemAsync: async () => null, deleteItemAsync: async () => {}, setItemAsync: async (...args) => saved.push(args) },
  });
  await auth.saveTokens({ accessToken: 'test-access', refreshToken: 'test-refresh', expiresAt: 123 });
  assert.equal(saved.length, 3);
  assert.ok(saved.every(([, , options]) => options.keychainAccessible === 'device-only'));
});

test('sync outside the home network sends no NAS request and keeps offline favorites available', async () => {
  const fixture = storeFixture(manifest({ offline: { 'a.pdf': oldRecord } }), { home: false, existing: { old: true } });
  await fixture.store.getState().initialize();
  await fixture.store.getState().syncFavorites();
  assert.equal(fixture.requests.length, 0);
  assert.equal(fixture.store.getState().status, 'waiting');
  const opened = await fixture.store.getState().openFile(oldRecord.entry);
  assert.equal(opened.uri, 'file:///old');
});

test('a failed replacement retains the previous offline version', async () => {
  const fixture = storeFixture(manifest({ offline: { 'a.pdf': oldRecord } }), { bytes: new Uint8Array([1]), existing: { old: true } });
  await fixture.store.getState().initialize();
  await fixture.store.getState().syncFavorites();
  assert.equal(fixture.store.getState().manifest.offline['a.pdf'].fileKey, 'old');
  assert.equal(fixture.files.has('old'), true);
  assert.equal(fixture.store.getState().status, 'error');
});

test('a successful replacement is committed before removing its previous version', async () => {
  const fixture = storeFixture(manifest({ offline: { 'a.pdf': oldRecord } }), { existing: { old: true } });
  await fixture.store.getState().initialize();
  await fixture.store.getState().syncFavorites();
  assert.equal(fixture.store.getState().manifest.offline['a.pdf'].fileKey, 'new-1');
  assert.equal(fixture.files.has('old'), false);
  assert.equal(fixture.store.getState().status, 'ready');
  assert.ok(fixture.saved.some((saved) => saved.offline['a.pdf']?.fileKey === 'new-1'));
  assert.ok(fixture.requests.every(({ request }) => ['GET', 'PROPFIND'].includes(request.method)));
});

test('a failed manifest commit restores the old offline version and removes the uncommitted download', async () => {
  const fixture = storeFixture(manifest({ offline: { 'a.pdf': oldRecord } }), { existing: { old: true }, failCommit: true });
  await fixture.store.getState().initialize();
  await fixture.store.getState().syncFavorites();
  assert.equal(fixture.store.getState().manifest.offline['a.pdf'].fileKey, 'old');
  assert.equal(fixture.files.has('old'), true);
  assert.equal(fixture.files.has('new-1'), false);
});

test('removing a folder favorite keeps files still covered by an explicit file favorite', async () => {
  const a = { ...oldRecord, entry: entry('folder/a.pdf') }, b = { ...oldRecord, entry: entry('folder/b.pdf'), fileKey: 'b' };
  const fixture = storeFixture(manifest({ favorites: [{ path: 'folder', name: 'folder', directory: true }, { path: 'folder/a.pdf', name: 'a.pdf', directory: false }], offline: { 'folder/a.pdf': a, 'folder/b.pdf': b } }), { existing: { old: true, b: true } });
  await fixture.store.getState().initialize();
  await fixture.store.getState().toggleFavorite(entry('folder', { directory: true }));
  assert.deepEqual(Object.keys(fixture.store.getState().manifest.offline), ['folder/a.pdf']);
  assert.equal(fixture.files.has('old'), true); assert.equal(fixture.files.has('b'), false);
});

test('a download completing after disconnect cannot restore credentials or offline records', async () => {
  let finish, started;
  const downloadStarted = new Promise((resolve) => { started = resolve; });
  const fixture = storeFixture(manifest(), { download: (files, entry) => new Promise((resolve) => { started(); finish = () => { files.set('late', true); resolve({ fileKey: 'late', entry, uri: 'file:///late' }); }; }) });
  await fixture.store.getState().initialize();
  const sync = fixture.store.getState().syncFavorites();
  await downloadStarted;
  await fixture.store.getState().disconnect();
  finish(); await sync;
  assert.equal(fixture.store.getState().config, null);
  assert.deepEqual(fixture.store.getState().manifest.offline, {});
  assert.equal(fixture.files.size, 0);
});

test('files deleted on the NAS remain marked offline instead of deleting their local copy', async () => {
  const fixture = storeFixture(manifest({ offline: { 'a.pdf': oldRecord } }), { remote: [], existing: { old: true } });
  await fixture.store.getState().initialize();
  await fixture.store.getState().syncFavorites();
  assert.equal(fixture.store.getState().manifest.offline['a.pdf'].missing, true);
  assert.equal(fixture.files.has('old'), true);
});

test('automatic sync waits for settings to finish saving and never runs when disabled', async () => {
  let listener, syncs = 0;
  const state = { config: { ...config, autoSync: false }, saving: false, manifest: manifest(), initialize: async () => {}, setHome() {}, syncFavorites: async () => { syncs++; } };
  const { startDocumentSync } = loadSource('src/documents/lifecycle.ts', {
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '@react-native-community/netinfo': { addEventListener: (callback) => { callback({ type: 'wifi', isConnected: true, details: { ipAddress: '192.168.178.12' } }); return () => {}; } },
    '../stores/useDocumentStore': { useDocumentStore: { getState: () => state, subscribe: (callback) => { listener = callback; return () => {}; } } },
    './network': { isHomeNetwork: () => true },
  }, { setInterval: () => 1, clearInterval() {} });
  const stop = startDocumentSync();
  await Promise.resolve();
  assert.equal(syncs, 0);
  let previous = { ...state };
  state.config = { ...config, autoSync: true }; state.saving = true;
  listener(state, previous);
  assert.equal(syncs, 0);
  previous = { ...state }; state.saving = false;
  listener(state, previous);
  assert.equal(syncs, 1);
  stop();
});

test('open previews keep their old file until preview and sharing leases are released', () => {
  const dirs = new Set(), files = new Set();
  const uri = (...parts) => parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
  class Directory {
    constructor(...parts) { this.uri = uri(...parts); }
    get exists() { return dirs.has(this.uri); }
    create() { dirs.add(this.uri); }
    delete() { dirs.delete(this.uri); }
  }
  class File {
    constructor(...parts) { this.uri = uri(...parts); }
    get parentDirectory() { return new Directory(this.uri.slice(0, this.uri.lastIndexOf('/'))); }
    get exists() { return files.has(this.uri); }
    create() { files.add(this.uri); }
  }
  const storage = loadSource('src/documents/storage.ts', {
    'expo-secure-store': {}, 'expo-crypto': {}, '../db/database': {},
    'expo-file-system': { Directory, File, Paths: { document: new Directory('file:///documents'), cache: new Directory('file:///cache') } },
  });
  const fileKey = '11111111-1111-4111-8111-111111111111/Plan.pdf';
  const file = storage.cachedFile(config.id, fileKey);
  file.parentDirectory.create(); file.create();
  const preview = storage.leaseCachedFile(config.id, fileKey);
  const shareRelease = preview.retain();
  storage.removeCachedFile(config.id, fileKey);
  assert.equal(file.parentDirectory.exists, true);
  preview.release();
  assert.equal(file.parentDirectory.exists, true);
  shareRelease();
  assert.equal(file.parentDirectory.exists, false);
  assert.throws(() => storage.cachedFile(config.id, '../outside'));
  assert.throws(() => storage.cachedFile(config.id, '11111111-1111-4111-8111-111111111111/%2e%2e'));
});
