export type RepeatRule = { frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'; interval: number; anchorDay?: number; anchorMonth?: number };
export type ChecklistItem = { id: string; title: string; done: boolean };
export type TaskAttachment = { id: string; configId: string; path: string; name: string };
export type TaskDetails = { recurrence?: RepeatRule | null; checklist?: ChecklistItem[]; attachments?: TaskAttachment[]; project?: string | null; tags?: string[] };

export function validateDetails(details: TaskDetails): TaskDetails {
  const result: TaskDetails = {};
  if (details.project !== undefined) {
    if (details.project !== null && (typeof details.project !== 'string' || details.project.trim().length > 80 || /[\u0000-\u001F]/.test(details.project))) throw new Error('Ein Projektname darf bis zu 80 Zeichen enthalten.');
    result.project = details.project?.trim() || null;
  }
  if (details.tags !== undefined) {
    if (!Array.isArray(details.tags) || details.tags.length > 20 || details.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 40 || /[\u0000-\u001F]/.test(tag))) throw new Error('Bis zu 20 Tags mit jeweils 40 Zeichen sind möglich.');
    result.tags = [...new Map(details.tags.map(tag => [tag.trim().toLocaleLowerCase('de-DE'), tag.trim()])).values()];
  }
  if (details.recurrence !== undefined) {
    const rule = details.recurrence;
    if (rule && (!['daily', 'weekdays', 'weekly', 'monthly', 'yearly'].includes(rule.frequency) || !Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 99
      || (rule.anchorDay !== undefined && (!Number.isInteger(rule.anchorDay) || rule.anchorDay < 1 || rule.anchorDay > 31))
      || (rule.anchorMonth !== undefined && (!Number.isInteger(rule.anchorMonth) || rule.anchorMonth < 0 || rule.anchorMonth > 11)))) throw new Error('Die Wiederholung ist ungültig.');
    result.recurrence = rule;
  }
  if (details.checklist !== undefined) {
    if (!Array.isArray(details.checklist) || details.checklist.length > 100) throw new Error('Eine Checkliste kann bis zu 100 Punkte enthalten.');
    const ids = new Set<string>();
    result.checklist = details.checklist.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500 || typeof item.done !== 'boolean') throw new Error('Ein Checklistenpunkt ist ungültig.');
      ids.add(item.id); return { id: item.id, title: item.title.trim(), done: item.done };
    });
  }
  if (details.attachments !== undefined) {
    if (!Array.isArray(details.attachments) || details.attachments.length > 30) throw new Error('Bis zu 30 Dokumente können verknüpft werden.');
    result.attachments = details.attachments.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || !/^[a-f0-9]{64}$/.test(item.configId) || typeof item.path !== 'string' || !item.path
        || item.path.split('/').some(part => !part || part === '.' || part === '..' || /[\\\u0000-\u001F]/.test(part)) || typeof item.name !== 'string' || !item.name || item.name.length > 255) throw new Error('Die Dokumentverknüpfung ist ungültig.');
      return { id: item.id, configId: item.configId, path: item.path, name: item.name };
    });
  }
  return result;
}

export function parseDetails(row: { recurrence?: string | null; checklist?: string | null; attachments?: string | null; project?: string | null; tags?: string | null }): TaskDetails {
  const result: TaskDetails = { recurrence: null, checklist: [], attachments: [], project: null, tags: [] };
  try { Object.assign(result, validateDetails({ project: row.project || null })); } catch { /* Ignore a damaged label. */ }
  for (const key of ['recurrence', 'checklist', 'attachments', 'tags'] as const) {
    try { Object.assign(result, validateDetails({ [key]: row[key] ? JSON.parse(row[key]!) : key === 'recurrence' ? null : [] })); } catch { /* Keep other fields readable if one saved field is damaged. */ }
  }
  return result;
}

export function nextOccurrence(due: string | null, rule: RepeatRule, completed = new Date()) {
  validateDetails({ recurrence: rule });
  const base = due ? new Date(due) : new Date(completed);
  if (!Number.isFinite(base.getTime()) || !Number.isFinite(completed.getTime())) throw new Error('Das Wiederholungsdatum ist ungültig.');
  const anchorDay = rule.anchorDay ?? base.getDate();
  const anchorMonth = rule.anchorMonth ?? base.getMonth();
  const threshold = new Date(completed); threshold.setHours(0, 0, 0, 0);
  const next = new Date(base);
  for (let n = 1; n <= 100000; n++) {
    if (rule.frequency === 'monthly' || rule.frequency === 'yearly') {
      const month = rule.frequency === 'monthly' ? base.getMonth() + n * rule.interval : anchorMonth;
      const year = base.getFullYear() + (rule.frequency === 'yearly' ? n * rule.interval : 0);
      next.setFullYear(year, month, 1);
      next.setDate(Math.min(anchorDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    } else {
      if (rule.frequency === 'weekdays') {
        for (let days = 0; days < rule.interval;) { next.setDate(next.getDate() + 1); if (next.getDay() !== 0 && next.getDay() !== 6) days++; }
      } else next.setDate(next.getDate() + (rule.frequency === 'weekly' ? 7 : 1) * rule.interval);
    }
    if (next.getTime() > base.getTime() && next >= threshold) return { due: next.toISOString(), recurrence: { ...rule, anchorDay, anchorMonth } };
  }
  throw new Error('Die nächste Wiederholung konnte nicht bestimmt werden.');
}
