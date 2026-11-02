import * as SecureStore from 'expo-secure-store';

export const PRIVACY_KEY = 'planner_privacy';
export type PrivacyPreferences = { enabled: boolean; hideNotificationText: boolean };
export async function readPrivacy(): Promise<PrivacyPreferences> {
  const value = await SecureStore.getItemAsync(PRIVACY_KEY);
  if (!value) return { enabled: false, hideNotificationText: false };
  const parsed = JSON.parse(value);
  if (typeof parsed.enabled !== 'boolean' || typeof parsed.hideNotificationText !== 'boolean') throw new Error('Die Datenschutzeinstellungen konnten nicht gelesen werden.');
  return parsed;
}
export const savePrivacy = (value: PrivacyPreferences) => SecureStore.setItemAsync(PRIVACY_KEY, JSON.stringify(value), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
export async function notificationText(title: string, body: string) {
  const hide = await readPrivacy().then(value => value.hideNotificationText).catch(() => true);
  return hide ? { title: 'Planner', body: 'Eine Erinnerung ist fällig. Öffne Planner für die Details.' } : { title, body };
}
