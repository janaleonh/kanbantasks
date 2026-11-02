import * as Notifications from 'expo-notifications';

let asking: Promise<boolean> | null = null;
export function requestNotificationPermissions(): Promise<boolean> {
  if (asking) return asking;
  asking = (async () => {
    try {
      const existing = await Notifications.getPermissionsAsync();
      if (existing.status === 'granted' || existing.ios?.status === Notifications.IosAuthorizationStatus?.PROVISIONAL) return true;
      const result = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
      return result.status === 'granted';
    } catch { return false; }
  })().finally(() => { asking = null; });
  return asking;
}
