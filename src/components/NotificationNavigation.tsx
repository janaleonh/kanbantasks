import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

export function NotificationNavigation() {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!active || response?.notification.request.content.data?.kind !== 'daily-briefing') return;
      // Notification data is untrusted: this action has one fixed destination.
      router.replace('/');
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => { active = false; subscription.remove(); };
  }, [router]);
  return null;
}
