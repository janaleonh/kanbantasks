import { getValidAccessToken } from '../auth/googleAuth';

const BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

// ── Types mirroring Google Tasks REST API ──────────────────
export interface GTaskList {
  kind: 'tasks#taskList';
  id: string;
  title: string;
  updated: string;
  selfLink: string;
}

export interface GTask {
  kind: 'tasks#task';
  id: string;
  title: string;
  updated: string;
  selfLink: string;
  parent?: string;
  position: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
  deleted?: boolean;
  hidden?: boolean;
}

function normalizeDueDate(due?: string | null): string | undefined {
  if (!due) return undefined;
  const parsed = new Date(due);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

// ── HTTP helper ─────────────────────────────────────────────
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API_ERROR ${res.status}: ${body}`);
  }

  // Handle 204 No Content or empty body (e.g. DELETE in Google Tasks API)
  if (res.status === 204) return undefined as unknown as T;

  const text = await res.text();
  if (!text || !text.trim()) {
    return undefined as unknown as T;
  }

  return JSON.parse(text) as T;
}

// ── Paginated helper ────────────────────────────────────────
async function paginate<T>(
  firstUrl: string,
  itemsKey: string
): Promise<T[]> {
  const results: T[] = [];
  let pageToken: string | undefined;
  const url = firstUrl;

  do {
    const fullUrl = pageToken ? `${url}&pageToken=${pageToken}` : url;
    const data: any = await request<any>(fullUrl);
    if (data && data[itemsKey]) results.push(...data[itemsKey]);
    pageToken = data?.nextPageToken;
  } while (pageToken);

  return results;
}

// ──────────────────────────────────────────────────────────
// Task Lists
// ──────────────────────────────────────────────────────────

export async function fetchAllTaskLists(): Promise<GTaskList[]> {
  return paginate<GTaskList>(
    '/users/@me/lists?maxResults=100',
    'items'
  );
}

export async function createRemoteTaskList(title: string): Promise<GTaskList> {
  return request<GTaskList>('/users/@me/lists', {
    method: 'POST',
    body: JSON.stringify({ title: title || 'Neue Liste' }),
  });
}

export async function updateRemoteTaskList(
  remoteId: string,
  title: string
): Promise<GTaskList> {
  return request<GTaskList>(`/users/@me/lists/${remoteId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: title || 'Liste' }),
  });
}

export async function deleteRemoteTaskList(remoteId: string): Promise<void> {
  try {
    await request<void>(`/users/@me/lists/${remoteId}`, { method: 'DELETE' });
  } catch (err) {
    const msg = (err as Error).message || '';
    if (
      msg === 'NOT_FOUND' ||
      msg.startsWith('API_ERROR 404') ||
      msg.startsWith('API_ERROR 400') ||
      msg.startsWith('API_ERROR 410')
    ) {
      return;
    }
    throw err;
  }
}

// ──────────────────────────────────────────────────────────
// Tasks
// ──────────────────────────────────────────────────────────

export async function fetchAllTasks(remoteListId: string): Promise<GTask[]> {
  const items = await paginate<GTask>(
    `/lists/${remoteListId}/tasks?maxResults=100&showCompleted=true&showHidden=true`,
    'items'
  );
  // Filter out soft-deleted tasks returned by Google Tasks API
  return items.filter((item) => !item.deleted);
}

export async function createRemoteTask(
  remoteListId: string,
  task: {
    title: string;
    notes?: string;
    due?: string | null;
    status?: 'needsAction' | 'completed';
  }
): Promise<GTask> {
  const payload: Record<string, any> = {
    title: task.title || 'Aufgabe',
  };
  if (task.notes) payload.notes = task.notes;
  const dueIso = normalizeDueDate(task.due);
  if (dueIso) payload.due = dueIso;
  if (task.status === 'completed') {
    payload.status = 'completed';
    payload.completed = new Date().toISOString();
  }

  return request<GTask>(`/lists/${remoteListId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRemoteTask(
  remoteListId: string,
  remoteTaskId: string,
  updates: Partial<{
    title: string;
    notes: string;
    status: string;
    due: string | null;
  }>
): Promise<GTask> {
  const payload: Record<string, any> = {};
  if (updates.title !== undefined) payload.title = updates.title || 'Aufgabe';
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.status !== undefined) {
    payload.status = updates.status;
    payload.completed =
      updates.status === 'completed' ? new Date().toISOString() : null;
  }
  if (updates.due !== undefined) {
    payload.due = updates.due ? normalizeDueDate(updates.due) ?? null : null;
  }

  return request<GTask>(`/lists/${remoteListId}/tasks/${remoteTaskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteRemoteTask(
  remoteListId: string,
  remoteTaskId: string
): Promise<void> {
  try {
    await request<void>(`/lists/${remoteListId}/tasks/${remoteTaskId}`, {
      method: 'DELETE',
    });
  } catch (err) {
    const msg = (err as Error).message || '';
    // Ignore 404/400/410 if task was already deleted on Google Tasks
    if (
      msg === 'NOT_FOUND' ||
      msg.startsWith('API_ERROR 404') ||
      msg.startsWith('API_ERROR 400') ||
      msg.startsWith('API_ERROR 410')
    ) {
      return;
    }
    throw err;
  }
}
