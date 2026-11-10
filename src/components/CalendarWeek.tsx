import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dayKey, eventsForDay, monthKey } from '../calendar/dates';
import type { CalendarEvent } from '../calendar/types';
import { useTheme } from '../hooks/useTheme';
import { CalendarAgenda } from './CalendarAgenda';

interface CalendarWeekProps {
  diaryDays?: string[];
  days: Date[];
  selectedDay: string;
  todayKey: string;
  eventsByMonth: Record<string, CalendarEvent[]>;
  selectedIds: string[];
  loadingMonths: string[];
  error: string | null;
  onAddEvent?: (date: Date) => void;
  onSelectDay?: (date: Date) => void;
}

export function CalendarWeek({ diaryDays=[], days, selectedDay, todayKey, eventsByMonth, selectedIds, loadingMonths, error, onAddEvent, onSelectDay }: CalendarWeekProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const columnWidth = Math.max(170, (width - 32 - 6 * 10) / 7);
  const rangeKey = dayKey(days[0]);
  const focusIndex = days.findIndex((date) => dayKey(date) === selectedDay);
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: Math.max(0, focusIndex) * (columnWidth + 10), animated: false });
  }, [rangeKey, focusIndex, columnWidth]);

  return <View>
    <Text style={[styles.hint, { color: theme.subtext }]}>Montag bis Sonntag · seitlich wischen</Text>
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.week} directionalLockEnabled>
      {days.map((date) => {
        const id = dayKey(date);
        const key = monthKey(date);
        const isToday = id === todayKey;
        const events = eventsForDay(eventsByMonth[key] || [], date, selectedIds);
        const loading = loadingMonths.includes(key);
        return <View key={id} style={[styles.day, { width: columnWidth, backgroundColor: theme.columnBg, borderRadius: theme.columnRadius, borderColor: isToday ? theme.accent : theme.border }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Tagesansicht für ${date.toLocaleDateString('de-DE')} öffnen`} disabled={!onSelectDay} onPress={() => onSelectDay?.(date)} style={[styles.dayHeader, { borderBottomColor: theme.border }]}>
            <Text accessibilityRole="header" style={[styles.weekday, { color: isToday ? theme.accent : theme.subtext }]}>{date.toLocaleDateString('de-DE', { weekday: 'long' })}{isToday ? ' · Heute' : ''}{diaryDays.includes(id) && <Ionicons name="book-outline" size={14} color={theme.accent}/>}</Text>
            <Text style={[styles.date, { color: theme.text }]}>{date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</Text>
          </TouchableOpacity>
          <View style={styles.events}>
            {onAddEvent && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Termin am ${date.toLocaleDateString('de-DE')} hinzufügen`} onPress={() => onAddEvent(date)} style={[styles.addButton, { borderColor: theme.border }]}><Ionicons name="add" size={19} color={theme.accent} /><Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>Termin</Text></TouchableOpacity>}
            {loading && <ActivityIndicator style={styles.spinner} color={theme.accent} />}
            {(!loading || events.length > 0) && (!error || events.length > 0) && <CalendarAgenda events={events} emptyText="Keine Termine" />}
          </View>
        </View>;
      })}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, marginBottom: 12 }, week: { gap: 10, paddingBottom: 12, alignItems: 'stretch' },
  day: { borderWidth: 1, minHeight: 340, overflow: 'hidden' },
  dayHeader: { padding: 14, borderBottomWidth: 1 }, weekday: { fontSize: 12, fontWeight: '600' },
  date: { fontSize: 23, fontWeight: '700', marginTop: 5 }, events: { padding: 10 }, spinner: { marginVertical: 10 },
  addButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 },
});
