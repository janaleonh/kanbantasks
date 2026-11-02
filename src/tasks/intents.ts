import { Alert, AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { captureTask } from '../db/taskRepo';
import { useKanbanStore } from '../stores/useKanbanStore';
import { usePrivacyStore } from '../stores/usePrivacyStore';

export function startTaskIntents() {
  if (Platform.OS !== 'ios' || !requireOptionalNativeModule('ExpoAppIntents')) return () => {};
  let stopped = false, running = false, queued = false;
  let subscription: { remove: () => void } | undefined;
  const process = async () => {
    const privacy = usePrivacyStore.getState();
    if (running) { queued = true; return; }
    if (stopped || !privacy.initialized || privacy.locked || AppState.currentState !== 'active') return;
    running = true;
    try {
      const api = await import('expo-app-intents');
      for (const invocation of await api.getPendingInvocationsAsync()) {
        if (stopped || usePrivacyStore.getState().locked) break;
        if (invocation.name !== 'createPlannerTask') continue;
        const title = invocation.params.title;
        if (typeof title !== 'string' || !title.trim() || title.length > 1000) { await api.removePendingInvocationAsync(invocation.id); continue; }
        await captureTask(title, '', null, `siri:${invocation.id}`);
        await api.removePendingInvocationAsync(invocation.id);
        await useKanbanStore.getState().loadAll();
        useKanbanStore.getState().scheduleSync();
      }
    } catch { if (!stopped) Alert.alert('Siri-Aufgabe', 'Die Aufgabe konnte noch nicht übernommen werden. Öffne Planner erneut, um es zu versuchen.'); }
    finally { running = false; if (queued) { queued = false; void process(); } }
  };
  void import('expo-app-intents').then(api => { if (stopped) return; subscription = api.addAppIntentListener(() => { void process(); }); void process(); }).catch(() => {});
  const unsubscribe = usePrivacyStore.subscribe(state => { if (state.initialized && !state.locked) void process(); });
  const app = AppState.addEventListener('change', state => { if (state === 'active') void process(); });
  return () => { stopped = true; subscription?.remove(); unsubscribe(); app.remove(); };
}
