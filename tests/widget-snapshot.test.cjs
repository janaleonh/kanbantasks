const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Compile only this pure projection; no React Native or SQLite runtime is needed.
const source = fs.readFileSync(require.resolve('../src/widgets/snapshot.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const projection = { exports: {} };
new Function('exports', 'module', compiled.outputText)(projection.exports, projection);
const { buildWidgetSnapshots } = projection.exports;

const lists = [{ id: 'work', title: 'Arbeit', isVisible: true }, { id: 'hidden', title: 'Privat', isVisible: false }];
const task = (id, extra = {}) => ({ id, title: id, listId: 'work', status: 'needsAction', deletedLocally: false, due: null, localPosition: 0, ...extra });

test('widgets exclude hidden lists, deleted tasks, and completed tasks', () => {
  const data = buildWidgetSnapshots(lists, {
    work: [task('offen'), task('erledigt', { status: 'completed' }), task('gelöscht', { deletedLocally: true })],
    hidden: [task('privat', { listId: 'hidden' })],
  });
  assert.equal(data.overview.count, 1);
  assert.deepEqual(data.overview.tasks.map((t) => t.title), ['offen']);
  assert.deepEqual(data.overview.lists, [{ id: 'work', title: 'Arbeit', count: 1 }]);
  assert.equal(data.today.count, 0);
});

test('today includes overdue tasks, sorts by due date, and rolls over at local midnight', () => {
  const now = new Date(2026, 10, 1, 23, 59);
  const data = { work: [
    task('morgen', { due: new Date(2026, 10, 2, 0, 0).toISOString() }),
    task('heute', { due: new Date(2026, 10, 1, 12).toISOString() }),
    task('gestern', { due: new Date(2026, 9, 31, 12).toISOString() }),
    task('ohne Datum'), task('ungültig', { due: 'invalid' }),
  ] };
  const before = buildWidgetSnapshots(lists, data, now);
  assert.deepEqual(before.today.tasks.map((t) => t.title), ['gestern', 'heute']);
  assert.equal(before.today.overdue, 1);
  const after = buildWidgetSnapshots(lists, data, new Date(2026, 10, 2));
  assert.equal(after.today.count, 3);
  assert.equal(after.today.overdue, 2);
  assert.equal(after.overview.count, 5);
});

test('empty and long lists give truthful counts with a bounded widget payload', () => {
  const empty = buildWidgetSnapshots([], {});
  assert.equal(empty.overview.hasData, true);
  assert.equal(empty.overview.count, 0);
  const many = buildWidgetSnapshots(lists, { work: Array.from({ length: 20 }, (_, i) => task(String(i))) });
  assert.equal(many.overview.count, 20);
  assert.equal(many.overview.tasks.length, 6);
  assert.equal(many.overview.lists[0].count, 20);
});
