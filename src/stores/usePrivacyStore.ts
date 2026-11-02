import { create } from 'zustand';
import * as LocalAuthentication from 'expo-local-authentication';
import { readPrivacy, savePrivacy, type PrivacyPreferences } from '../security/privacy';

interface PrivacyState extends PrivacyPreferences {
  initialized: boolean; locked: boolean; busy: boolean; error: string | null;
  initialize: () => Promise<void>; unlock: () => Promise<boolean>; lock: () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
  setHideNotificationText: (hide: boolean) => Promise<void>;
}
let initializing: Promise<void> | null = null;
let lockRevision = 0;
export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  initialized: false, enabled: true, locked: true, busy: false, hideNotificationText: true, error: null,
  initialize: async () => {
    if (get().initialized) return;
    if (initializing) return initializing;
    initializing = readPrivacy().then(value => { set({ ...value, initialized: true, locked: value.enabled, error: null }); }).catch(() => {
      set({ error: 'Datenschutzeinstellungen konnten nicht gelesen werden. Bitte versuche es erneut.', locked: true });
    }).finally(() => { initializing = null; });
    return initializing;
  },
  lock: () => { if (get().enabled) { lockRevision++; set({ locked: true }); } },
  unlock: async () => {
    if (!get().initialized || get().busy) return false;
    if (!get().enabled) { set({ locked: false }); return true; }
    set({ busy: true, error: null });
    const version = lockRevision;
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Planner entsperren', cancelLabel: 'Abbrechen', fallbackLabel: 'Gerätecode verwenden', disableDeviceFallback: false });
      if (result.success && version === lockRevision) set({ locked: false });
      else set({ error: 'Planner bleibt gesperrt. Du kannst es erneut versuchen.' });
      return result.success && version === lockRevision;
    } catch { set({ error: 'Die Geräteprüfung ist nicht verfügbar. Bitte verwende eine native App-Version mit Face-ID-Unterstützung.' }); return false; }
    finally { set({ busy: false }); }
  },
  setEnabled: async enabled => {
    if (!get().initialized || get().busy) return;
    set({ busy: true, error: null });
    try {
      if (enabled && (!await LocalAuthentication.hasHardwareAsync() || !await LocalAuthentication.isEnrolledAsync())) throw new Error('Richte zuerst Face ID oder Touch ID auf deinem Gerät ein.');
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: enabled ? 'App-Sperre aktivieren' : 'App-Sperre deaktivieren', cancelLabel: 'Abbrechen', disableDeviceFallback: false });
      if (!result.success) throw new Error('Die Einstellung wurde nicht geändert.');
      await savePrivacy({ enabled, hideNotificationText: get().hideNotificationText });
      set({ enabled, locked: false });
    } finally { set({ busy: false }); }
  },
  setHideNotificationText: async hideNotificationText => {
    if (!get().initialized || get().busy) return;
    set({ busy: true });
    try { await savePrivacy({ enabled: get().enabled, hideNotificationText }); set({ hideNotificationText }); }
    finally { set({ busy: false }); }
  },
}));
