import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { eventsForDay, localDate, monthKey } from '../calendar/dates';
import { useCalendarStore } from '../stores/useCalendarStore';
import { useKanbanStore } from '../stores/useKanbanStore';
import { useTheme } from '../hooks/useTheme';
import { CalendarAgenda } from './CalendarAgenda';

export function TodayCalendarEvents() {
  const theme = useTheme();
  const router = useRouter();
  const { todayKey, selectedIds, eventsByMonth, loadingMonths, error } = useCalendarStore();
  const search = useKanbanStore((s) => s.searchQuery).trim().toLowerCase();
  const date = localDate(todayKey);
  const key = monthKey(date);
  const events = eventsForDay(eventsByMonth[key] || [], date, selectedIds).filter((event) => !search || `${event.title} ${event.calendarTitle} ${event.location}`.toLowerCase().includes(search));
  if (!events.length) return null;
  return <View style={styles.container}>
    <View style={styles.headingRow}>
      <Text style={[styles.heading, { color: theme.subtext }]}>TERMINE HEUTE</Text>
      {loadingMonths.includes(key) && <ActivityIndicator size="small" color={theme.accent} />}
    </View>
      {error && <TouchableOpacity onPress={() => router.push('/settings')}><Text style={[styles.hint, { color: theme.subtext }]}>{events.length ? 'Zuletzt geladene Termine. ' : ''}{error}</Text></TouchableOpacity>}
      <CalendarAgenda events={events} />
  </View>;
}

const styles = StyleSheet.create({
  container: { paddingVertical: 10 }, headingRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 9 },
  heading: { fontSize: 11, fontWeight: '700', letterSpacing: 1 }, hint: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
});
