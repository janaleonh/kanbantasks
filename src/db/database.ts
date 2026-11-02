import * as SQLite from 'expo-sqlite';

const DB_NAME = 'kanban_tasks.db';

let db: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (!opening) {
    opening = (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      try {
        await runMigrations(database);
        db = database;
        return database;
      } catch (error) {
        await database.closeAsync();
        throw error;
      }
    })().finally(() => { opening = null; });
  }
  return opening;
}

async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS task_lists (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,
      isVisible INTEGER DEFAULT 1,
      color TEXT,
      updatedAt TEXT NOT NULL,
      syncStatus TEXT DEFAULT 'pending',
      deletedLocally INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      remoteId TEXT,
      listId TEXT NOT NULL,
      previousListId TEXT,
      title TEXT NOT NULL,
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'needsAction',
      due TEXT,
      position TEXT,
      localPosition INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL,
      syncStatus TEXT DEFAULT 'pending',
      deletedLocally INTEGER DEFAULT 0,
      FOREIGN KEY (listId) REFERENCES task_lists(id)
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Safe migrations for existing databases
  const safeAlters = [
    'ALTER TABLE tasks ADD COLUMN previousListId TEXT;',
    'ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT "none";',
    'ALTER TABLE tasks ADD COLUMN reminderAt TEXT;',
    'ALTER TABLE tasks ADD COLUMN recurrence TEXT;',
    'ALTER TABLE tasks ADD COLUMN checklist TEXT;',
    'ALTER TABLE tasks ADD COLUMN attachments TEXT;',
    'ALTER TABLE tasks ADD COLUMN repeatSourceId TEXT;',
    'ALTER TABLE tasks ADD COLUMN project TEXT;',
    'ALTER TABLE tasks ADD COLUMN tags TEXT;',
    'ALTER TABLE task_lists ADD COLUMN isVisible INTEGER DEFAULT 1;',
    'ALTER TABLE task_lists ADD COLUMN color TEXT;',
    'ALTER TABLE task_lists ADD COLUMN icon TEXT;',
  ];
  for (const sql of safeAlters) {
    try {
      await database.execAsync(sql);
    } catch {
      // Column already exists
    }
  }
  await database.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_repeat_source ON tasks(repeatSourceId) WHERE repeatSourceId IS NOT NULL;
    CREATE TABLE IF NOT EXISTS capture_receipts (id TEXT PRIMARY KEY, taskId TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS task_repeat_receipts (sourceId TEXT PRIMARY KEY, nextTaskId TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS task_history (id TEXT PRIMARY KEY, taskId TEXT NOT NULL, label TEXT NOT NULL, beforeJson TEXT NOT NULL, afterJson TEXT NOT NULL, createdAt TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS scans (id TEXT PRIMARY KEY, name TEXT NOT NULL, pages INTEGER NOT NULL, size INTEGER NOT NULL, createdAt TEXT NOT NULL);
    INSERT OR IGNORE INTO task_repeat_receipts (sourceId, nextTaskId) SELECT repeatSourceId, id FROM tasks WHERE repeatSourceId IS NOT NULL;
  `);
}

export async function getSetting(key: string, defaultValue: string): Promise<string> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    [key]
  );
  return row?.value ?? defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    [key, value]
  );
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}
