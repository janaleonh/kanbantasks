export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    // Do not resolve or fetch shared web URLs. The capture form reads raw text.
    const url = new URL(path, 'kanban-tasks://');
    if (url.hostname === 'expo-sharing' || url.pathname.startsWith('/expo-sharing')) {
      const delivery = url.searchParams.get('delivery');
      return delivery && /^[a-f0-9-]{36}$/i.test(delivery) ? '/receive?delivery=' + delivery : '/capture?source=share';
    }
    return path;
  } catch { return '/'; }
}
