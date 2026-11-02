import { create } from 'zustand';

export const useBriefingStatus = create<{ message: string; count: number; until: string | null; error: boolean }>(() => ({
  message: 'Die tägliche Übersicht wird vorbereitet.', count: 0, until: null, error: false,
}));
