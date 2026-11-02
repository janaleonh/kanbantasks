export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    // Do not resolve or fetch shared web URLs. The capture form reads raw text.
    const url = new URL(path, 'kanban-tasks://');
    if (url.hostname === 'expo-sharing' || url.pathname.startsWith('/expo-sharing')) return '/capture?source=share';
    return path;
  } catch { return '/'; }
}
