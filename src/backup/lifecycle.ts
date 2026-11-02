import { AppState } from 'react-native';
import { getSetting } from '../db/database';
import { useBackupStore } from '../stores/useBackupStore';
import { useDocumentStore } from '../stores/useDocumentStore';
import { useKanbanStore } from '../stores/useKanbanStore';
import { usePrivacyStore } from '../stores/usePrivacyStore';

export function startAutomaticBackups() {
  let stopped = false, checking = false, lastAttempt = 0;
  const attempt = async () => {
    if (stopped || checking || Date.now() - lastAttempt < 5 * 60 * 1000 || AppState.currentState !== 'active') return;
    const backup = useBackupStore.getState(), doc = useDocumentStore.getState(), privacy = usePrivacyStore.getState();
    if (!backup.initialized || !backup.automatic || backup.busy || !doc.config || !doc.home || doc.saving || doc.uploading || doc.status === 'syncing' || !privacy.initialized || privacy.locked || !useKanbanStore.getState().hasLoaded) return;
    checking = true;
    try {
      const last = await getSetting(`nasBackupAt:${doc.config.id}`, '');
      const elapsed = Date.now() - new Date(last).getTime();
      if (last && elapsed >= 0 && elapsed < 24 * 60 * 60 * 1000) return;
      lastAttempt = Date.now();
      await backup.createBackup();
    } catch { /* The backup screen shows the last failure; retry while active later. */ }
    finally { checking = false; }
  };
  const unsubs = [useDocumentStore.subscribe((state, previous) => { if (state.config?.id !== previous.config?.id) useBackupStore.setState({ files: [], lastAt: null }); void attempt(); }), useKanbanStore.subscribe(() => { void attempt(); }), usePrivacyStore.subscribe(() => { void attempt(); }), useBackupStore.subscribe(() => { void attempt(); })];
  const app = AppState.addEventListener('change', () => { void attempt(); });
  const timer = setInterval(() => { void attempt(); }, 5 * 60 * 1000);
  void useBackupStore.getState().initialize().then(attempt).catch(() => {});
  return () => { stopped = true; unsubs.forEach(unsub => unsub()); app.remove(); clearInterval(timer); };
}
