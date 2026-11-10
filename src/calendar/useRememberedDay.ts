import { useCallback, useState } from 'react';
import storage from 'expo-sqlite/kv-store';
import { dayKey, localDate } from './dates';

export function useRememberedDay(section: 'events' | 'diary' | 'cycle', today: string) {
  const key = 'calendar.lastDay.' + section;
  const [choice, setChoice] = useState<string | null>(() => {
    try {
      const stored = storage.getItemSync(key);
      return stored && /^\d{4}-\d{2}-\d{2}$/.test(stored) && dayKey(localDate(stored)) === stored ? stored : null;
    } catch {
      return null;
    }
  });
  const select = useCallback((day: string | null) => {
    setChoice(day);
    try {
      if (day === null) storage.removeItemSync(key);
      else storage.setItemSync(key, day);
    } catch {
      // The current session can still navigate if preference storage is unavailable.
    }
  }, [key]);
  return [choice ?? today, select] as const;
}
