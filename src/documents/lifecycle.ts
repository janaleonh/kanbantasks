import { AppState } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useDocumentStore } from '../stores/useDocumentStore';
import { isHomeNetwork } from './network';

export function startDocumentSync() {
  let stopped = false;
  let network: NetInfoState | null = null;
  let lastAttempt = 0;
  const attempt = () => {
    if (stopped) return;
    const state = useDocumentStore.getState();
    const home = !!state.config && !!network && isHomeNetwork(network, state.config);
    state.setHome(home);
    if (home && !state.saving && state.config?.autoSync && state.manifest.favorites.length && AppState.currentState === 'active' && Date.now() - lastAttempt > 30000) {
      lastAttempt = Date.now();
      void state.syncFavorites();
    }
  };
  void useDocumentStore.getState().initialize().then(attempt);
  const unsubscribeNetwork = NetInfo.addEventListener((state) => { network = state; attempt(); });
  const unsubscribeStore = useDocumentStore.subscribe((state, previous) => {
    if (state.config !== previous.config) { lastAttempt = 0; attempt(); }
    else if (previous.saving && !state.saving) attempt();
  });
  const app = AppState.addEventListener('change', (state) => { if (state === 'active') attempt(); });
  const interval = setInterval(attempt, 5 * 60 * 1000);
  return () => { stopped = true; clearInterval(interval); app.remove(); unsubscribeNetwork(); unsubscribeStore(); };
}
