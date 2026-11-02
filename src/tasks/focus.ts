export type FocusSession = { taskId: string; title: string; duration: number; endAt: number | null; paused: number | null; startedAt: number };
export function remainingFocus(session: FocusSession, now = Date.now()) {
  if (!session.duration) return null;
  return session.paused ?? Math.max(0, Math.ceil(((session.endAt || now) - now) / 1000));
}
export function parseFocus(value: string): FocusSession | null {
  if (value === 'null') return null;
  const item = JSON.parse(value);
  if (!item || typeof item.taskId !== 'string' || typeof item.title !== 'string' || !Number.isInteger(item.duration) || item.duration < 0 || item.duration > 21600 || !Number.isFinite(item.startedAt)
    || (item.endAt !== null && !Number.isFinite(item.endAt)) || (item.paused !== null && (!Number.isInteger(item.paused) || item.paused < 0 || item.paused > 21600))) throw new Error('Die Fokus-Sitzung ist ungültig.');
  return item;
}
