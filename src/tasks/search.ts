import type { Task } from '../db/taskRepo';
import type { TaskList } from '../db/taskListRepo';
import type { NasManifest, DavEntry } from '../documents/types';
import type { CalendarEvent } from '../calendar/types';

const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de-DE');
export function searchPlanner(lists: TaskList[], tasksByList: Record<string, Task[]>, manifest: NasManifest, events: CalendarEvent[], query: string, project?: string, tag?: string) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = (text: string) => terms.every(term => normalize(text).includes(term));
  const tasks = lists.filter(list => !list.deletedLocally).flatMap(list => (tasksByList[list.id] || []).filter(task => !task.deletedLocally)
    .filter(task => (!project || task.project === project) && (!tag || task.tags?.includes(tag)))
    .map(task => ({ task, listTitle: list.title })))
    .filter(({ task, listTitle }) => matches([task.title, task.notes, listTitle, task.project, ...(task.tags || []), ...(task.checklist || []).map(item => item.title), ...(task.attachments || []).map(item => item.name)].filter(Boolean).join(' ')));
  const docs = new Map<string, DavEntry>();
  for (const entry of [...Object.values(manifest.folders).flatMap(folder => folder.entries), ...Object.values(manifest.offline).map(record => record.entry)]) if (!entry.directory) docs.set(entry.path, entry);
  return { tasks, documents: project || tag ? [] : [...docs.values()].filter(entry => matches(`${entry.name} ${entry.path}`)),
    events: project || tag ? [] : [...new Map(events.map(event => [event.id, event])).values()].filter(event => matches(`${event.title} ${event.location} ${event.calendarTitle}`)) };
}
