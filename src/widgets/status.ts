import { create } from 'zustand';

export type WidgetSyncStatus = {
  state: 'idle' | 'loading' | 'updated' | 'blocked' | 'error' | 'unavailable';
  message: string;
  updatedAt: string | null;
};

export const useWidgetStatus = create<WidgetSyncStatus>(() => ({
  state: 'idle', message: 'Die Widgets wurden noch nicht aktualisiert.', updatedAt: null,
}));
