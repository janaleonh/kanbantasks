import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useCalendarStore } from '../stores/useCalendarStore';

export function startCalendarSync() {
  let stopped = false;
  let midnightTimer: ReturnType<typeof setTimeout>;
  const refresh = () => {
    useCalendarStore.getState().updateDay();
    if (AppState.currentState === 'active') {
      const state = useCalendarStore.getState();
      if (state.account && !state.calendars.length) void state.refreshCalendars();
      else void state.loadMonth(new Date(), true);
    }
  };
  const scheduleMidnight = () => {
    clearTimeout(midnightTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    midnightTimer = setTimeout(() => { if (!stopped) { refresh(); scheduleMidnight(); } }, next.getTime() - now.getTime() + 100);
  };
  void useCalendarStore.getState().initialize();
  scheduleMidnight();
  const appSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') { refresh(); scheduleMidnight(); }
  });
  let disconnected = false;
  const unsubscribeNetwork = NetInfo.addEventListener((state) => {
    if (state.isConnected === false) disconnected = true;
    if (state.isConnected && disconnected) { disconnected = false; refresh(); }
  });
  const periodic = setInterval(refresh, 5 * 60 * 1000);
  return () => {
    stopped = true;
    clearTimeout(midnightTimer);
    clearInterval(periodic);
    appSubscription.remove();
    unsubscribeNetwork();
  };
}
