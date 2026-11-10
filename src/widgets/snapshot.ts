import type { Task } from '../db/taskRepo';
import type { TaskList } from '../db/taskListRepo';

export type WidgetProps = {
  stamp?: string;
  count: number;
  overdue: number;
  tasks: { id: string; title: string; listTitle: string }[];
  lists: { id: string; title: string; count: number }[];
  hasData: boolean;
};

// Pure data projection: widget extensions cannot access the app's SQLite database.
export function buildWidgetSnapshots(lists: TaskList[], tasksByList: Record<string, Task[]>, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const visible = lists.filter((list) => list.isVisible);
  const open = visible.flatMap((list) => (tasksByList[list.id] || [])
    .filter((task) => task.status === 'needsAction' && !task.deletedLocally)
    .map((task) => ({ ...task, listTitle: list.title })));
  const dueTime = (task: Task) => task.due ? new Date(task.due).getTime() : Infinity;
  const today = open.filter((task) => dueTime(task) < end || (task.due == null && task.listTitle.trim().toLocaleLowerCase('de-DE') === 'heute'))
    .sort((a, b) => dueTime(a) - dueTime(b) || a.localPosition - b.localPosition);
  const overdue = today.filter((task) => dueTime(task) < start).length;
  const listCounts = visible.map((list) => ({
    id: list.id, title: list.title, count: open.filter((task) => task.listId === list.id).length,
  }));
  const project = (tasks: typeof open): WidgetProps => ({
    count: tasks.length, overdue, hasData: true,
    tasks: tasks.slice(0, 6).map(({ id, title, listTitle }) => ({ id, title, listTitle })),
    lists: listCounts.slice(0, 5),
  });
  return { today: project(today), overview: project(open) };
}
