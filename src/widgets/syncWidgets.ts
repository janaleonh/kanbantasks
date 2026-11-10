import { AppState, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { useKanbanStore } from '../stores/useKanbanStore';
import { buildWidgetSnapshots } from './snapshot';
import { useWidgetStatus } from './status';

let widgets: Promise<[typeof import('./TodayTasks'), typeof import('./TasksOverview')]> | null = null;
let updating: Promise<boolean> | null = null;
let queued = false;

function available() {
  if (Platform.OS !== 'ios' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    useWidgetStatus.setState({ state: 'unavailable', message: 'iPhone-Widgets benötigen eine installierte native iOS-App. In Expo Go sind sie nicht verfügbar.' });
    return false;
  }
  const native = requireOptionalNativeModule<{ widgetsDirectory?: string | null }>('ExpoWidgets');
  if (!native) {
    useWidgetStatus.setState({ state: 'unavailable', message: 'Die Widget-Erweiterung fehlt in dieser App-Version. Bitte installiere einen neuen iOS-Build.' });
    return false;
  }
  if (!native.widgetsDirectory) {
    useWidgetStatus.setState({ state: 'blocked', message: 'Der gemeinsame Widget-Speicher ist nicht erreichbar. App und Widget müssen beim Signieren dieselbe App-Group-Berechtigung behalten. Ein erneutes Öffnen der App behebt diese Installationsberechtigung nicht.' });
    return false;
  }
  return true;
}

export function refreshWidgets(reloadData = false): Promise<boolean> {
  if (updating) { queued = true; return updating; }
  updating = (async () => {
    try {
      if (!available()) return false;
      useWidgetStatus.setState({ state: 'loading', message: 'Aufgaben werden für die Widgets bereitgestellt …' });
      let state = useKanbanStore.getState();
      if ((reloadData || !state.hasLoaded) && !state.isLoading) await state.loadAll();
      state = useKanbanStore.getState();
      if (!state.hasLoaded) {
        useWidgetStatus.setState({ state: state.error ? 'error' : 'loading', message: state.error ? 'Die Aufgaben konnten nicht geladen werden. Bitte aktualisiere das Board und versuche es erneut.' : 'Die Aufgaben werden noch geladen …' });
        return false;
      }
      if (!widgets) widgets = Promise.all([import('./TodayTasks'), import('./TasksOverview')]);
      const [todayModule, overviewModule] = await widgets;
      do {
        queued = false;
        const current = useKanbanStore.getState();
        const now = new Date();
        const entries = Array.from({ length: 8 }, (_, i) => {
          const date = i === 0 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
          return { date, snapshot: buildWidgetSnapshots(current.taskLists, current.tasksByList, date) };
        });
        const stamp = now.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const today = entries.map(({ date, snapshot }) => ({ date, props: { ...snapshot.today, stamp } }));
        const overview = entries.map(({ date, snapshot }) => ({ date, props: { ...snapshot.overview, stamp } }));
        todayModule.default.updateTimeline(today);
        overviewModule.default.updateTimeline(overview);
        // Verify the native write. The extension's separate read/signature still
        // requires an on-device check; a JS call alone is not proof of delivery.
        const stored = await Promise.all([todayModule.default.getTimeline(), overviewModule.default.getTimeline()]);
        const expected = [today, overview];
        const invalid = stored.some((timeline, index) => timeline.length !== entries.length || timeline.some((entry, i) => {
          const props = entry.props, sent = expected[index][i];
          return entry.date.getTime() !== sent.date.getTime() || !props?.hasData || props.stamp !== stamp ||
            props.count !== sent.props.count || props.overdue !== sent.props.overdue ||
            props.tasks?.length !== sent.props.tasks.length || props.lists?.length !== sent.props.lists.length ||
            sent.props.tasks.some((task, j) => task.id !== props.tasks[j]?.id || task.title !== props.tasks[j]?.title || task.listTitle !== props.tasks[j]?.listTitle) ||
            sent.props.lists.some((list, j) => list.id !== props.lists[j]?.id || list.count !== props.lists[j]?.count || list.title !== props.lists[j]?.title);
        }));
        if (invalid) throw new Error('Widget timeline not persisted');
        const latest = useKanbanStore.getState();
        if (latest.taskLists !== current.taskLists || latest.tasksByList !== current.tasksByList) queued = true;
        useWidgetStatus.setState({ state: 'updated', updatedAt: now.toISOString(), message: `Bereitgestellt: ${today[0].props.count} im Heute-Widget · ${overview[0].props.count} offene Aufgaben insgesamt. Heute: ${today[0].props.tasks.slice(0, 3).map(task => task.title).join(' · ') || 'keine'}. Übersicht: ${overview[0].props.tasks.slice(0, 3).map(task => task.title).join(' · ') || 'keine'}. iOS bestimmt den Anzeigezeitpunkt.` });
      } while (queued);
      return true;
    } catch {
      widgets = null;
      useWidgetStatus.setState({ state: 'error', message: 'Die Widget-Daten konnten nicht gespeichert werden. Bitte erneut aktualisieren. Falls das Widget weiter „App zum Laden öffnen“ zeigt, müssen auch die App-Group-Berechtigungen der Widget-Erweiterung geprüft werden.' });
      return false;
    }
  })().finally(() => { updating = null; });
  return updating;
}

export function startWidgetSync() {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = () => { if (!disposed) void refreshWidgets(); };
  const unsubscribe = useKanbanStore.subscribe((state, previous) => {
    if (!state.hasLoaded && previous.isLoading && !state.isLoading && state.error) {
      useWidgetStatus.setState({ state: 'error', message: 'Die Aufgaben konnten nicht geladen werden. Bitte aktualisiere das Board und versuche es erneut.' });
      return;
    }
    if (state.taskLists === previous.taskLists && state.tasksByList === previous.tasksByList && state.hasLoaded === previous.hasLoaded) return;
    clearTimeout(timer);
    timer = setTimeout(publish, 200);
  });
  const subscription = AppState.addEventListener('change', phase => { if (phase === 'active') { clearTimeout(timer); publish(); } });
  // Hydrate even when launched directly into Settings, Calendar or a document.
  publish();
  return () => { disposed = true; clearTimeout(timer); unsubscribe(); subscription.remove(); };
}
