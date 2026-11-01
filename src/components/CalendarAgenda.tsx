import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { eventTimeLabel } from '../calendar/dates';
import type { CalendarEvent } from '../calendar/types';
import { useTheme } from '../hooks/useTheme';

export function CalendarAgenda({ events, emptyText = 'Keine Termine an diesem Tag.' }: { events: CalendarEvent[]; emptyText?: string }) {
  const theme = useTheme();
  const router = useRouter();
  const showEvent = (event: CalendarEvent) => {
    router.push({ pathname: '/event', params: { calendarId: event.calendarId, eventId: event.eventId || event.id.slice(event.calendarId.length + 1) } });
  };
  if (!events.length) return <Text style={[styles.empty, { color: theme.subtext }]}>{emptyText}</Text>;
  return <View style={styles.events}>{events.map((event) => (
    <TouchableOpacity key={event.id} accessibilityRole="button" accessibilityLabel={`${eventTimeLabel(event)}, ${event.title}, ${event.calendarTitle}`} onPress={() => showEvent(event)} style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder, borderLeftColor: event.color, borderRadius: theme.cardRadius }]}>
      <View style={styles.timeRow}>
        <Ionicons name="calendar-outline" size={13} color={theme.accent} />
        <Text style={[styles.time, { color: theme.accent }]}>{eventTimeLabel(event)}</Text>
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{event.title}</Text>
      <Text style={[styles.detail, { color: theme.subtext }]} numberOfLines={1}>{event.calendarTitle}{event.location ? ` · ${event.location}` : ''}</Text>
    </TouchableOpacity>
  ))}</View>;
}

const styles = StyleSheet.create({
  events: { gap: 9 },
  card: { borderWidth: 1, borderLeftWidth: 3, padding: 13 },
  timeRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 7 },
  time: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  detail: { fontSize: 12, marginTop: 5 },
  empty: { fontSize: 13, lineHeight: 20, paddingVertical: 12 },
});
