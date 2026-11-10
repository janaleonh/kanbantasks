import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

// Kept separate from Planner's tasks, search, widgets and NAS exports.
let connection: SQLiteDatabase | undefined;
function journal() {
  if (!connection) {
    const db = openDatabaseSync('planner_private_journal.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS diary(day TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS diary_items (
        id TEXT PRIMARY KEY, day TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS diary_items_day ON diary_items(day);
      CREATE TABLE IF NOT EXISTS symptoms(day TEXT NOT NULL, name TEXT NOT NULL,
        strength TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', PRIMARY KEY(day,name));
    `);
    connection = db;
  }
  return connection;
}
export const diaryDays = () => journal().getAllSync<{day:string}>('SELECT day FROM diary UNION SELECT day FROM diary_items ORDER BY day DESC').map(row=>row.day);
export const readDiary = (day:string) => journal().getFirstSync<{body:string}>('SELECT body FROM diary WHERE day=?',day)?.body ?? '';
export function writeDiary(day:string,body:string) {
  if (body.trim()) journal().runSync('INSERT OR REPLACE INTO diary(day,body) VALUES(?,?)',day,body);
  else journal().runSync('DELETE FROM diary WHERE day=?',day);
}
export type Symptom = {name:string;strength:string;note:string};
export const readSymptoms = (day:string) => journal().getAllSync<Symptom>('SELECT name,strength,note FROM symptoms WHERE day=? ORDER BY rowid',day);
export function writeSymptom(day:string,item:Symptom) {
  journal().runSync('INSERT INTO symptoms(day,name,strength,note) VALUES(?,?,?,?) ON CONFLICT(day,name) DO UPDATE SET strength=excluded.strength,note=excluded.note',day,item.name,item.strength,item.note);
}
export const removeSymptom = (day:string,name:string) => journal().runSync('DELETE FROM symptoms WHERE day=? AND name=?',day,name);

export type DiaryItem = {id:string;kind:'photo'|'place'|'link';value:string};
export const dayItems = (day:string) => journal().getAllSync<DiaryItem>('SELECT id,kind,value FROM diary_items WHERE day=? ORDER BY rowid',day);
export function addDayItem(day:string,item:DiaryItem) {
  journal().runSync('INSERT INTO diary_items(id,day,kind,value) VALUES(?,?,?,?)',item.id,day,item.kind,item.value);
}
export function deleteDayItem(day:string,id:string) {
  journal().runSync('DELETE FROM diary_items WHERE day=? AND id=?',day,id);
}
export function deleteDiary(day:string) {
  const db=journal();
  db.withTransactionSync(()=>{
    db.runSync('DELETE FROM diary_items WHERE day=?',day);
    db.runSync('DELETE FROM diary WHERE day=?',day);
  });
}
