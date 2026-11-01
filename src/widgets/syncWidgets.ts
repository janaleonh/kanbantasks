import { AppState, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { useKanbanStore } from '../stores/useKanbanStore';
import { buildWidgetSnapshots } from './snapshot';

// Keep Expo Go usable: never import widget definitions without their native module.
export function startWidgetSync() {
  if (Platform.OS !== 'ios' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient || !requireOptionalNativeModule('ExpoWidgets')) {
    return () => {};
  }
  let disposed = false;
  let ready = useKanbanStore.getState().taskLists.length > 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const widgets = Promise.all([import('./TodayTasks'), import('./TasksOverview')]);

  const publish = () => {
    if (!ready || disposed) return;
    void widgets.then(([todayWidget, overviewWidget]) => {
      if (disposed) return;
      const state = useKanbanStore.getState();
      const now = new Date();
      // Midnight entries keep the date filter accurate while the app is closed.
      const snapshots = Array.from({ length: 8 }, (_, i) => {
        const date = i === 0 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        return { date, snapshot: buildWidgetSnapshots(state.taskLists, state.tasksByList, date) };
      });
      todayWidget.default.updateTimeline(snapshots.map(({ date, snapshot }) => ({ date, props: snapshot.today })));
      overviewWidget.default.updateTimeline(snapshots.map(({ date, snapshot }) => ({ date, props: snapshot.overview })));
    }).catch((error) => console.warn('Widgets konnten nicht aktualisiert werden:', error));
  };

  const unsubscribe = useKanbanStore.subscribe((state, previous) => {
    if (state.taskLists === previous.taskLists && state.tasksByList === previous.tasksByList) return;
    ready = true;
    clearTimeout(timer);
    timer = setTimeout(publish, 200);
  });
  const subscription = AppState.addEventListener('change', () => {
    clearTimeout(timer);
    publish();
  });
  publish();
  // Handle an import error even if no data has been hydrated yet.
  void widgets.catch((error) => console.warn('Widgets nicht verfügbar:', error));
  return () => {
    disposed = true;
    clearTimeout(timer);
    unsubscribe();
    subscription.remove();
  };
}
