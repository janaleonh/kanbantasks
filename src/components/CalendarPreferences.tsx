import React from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCalendarStore } from '../stores/useCalendarStore';
import { useTheme } from '../hooks/useTheme';

export function CalendarPreferences({ onConnect, connecting }: { onConnect: () => void; connecting: boolean }) {
  const theme = useTheme();
  const { account, calendars, selectedIds, loadingCalendars, error, refreshCalendars, selectCalendars } = useCalendarStore();
  return <View style={styles.section}>
    <Text style={[styles.heading, { color: theme.subtext }]}>GOOGLE KALENDER</Text>
    <Text style={[styles.description, { color: theme.subtext }]}>Wähle die Kalender für deine Kalenderansicht und „Heute“. In Kalendern mit Schreibzugriff kannst du Termine anlegen und verwalten.</Text>
    <TouchableOpacity accessibilityRole="button" disabled={connecting} onPress={onConnect} style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
      <Ionicons name="logo-google" size={21} color={theme.accent} />
      <Text style={[styles.title, { color: theme.accent }]}>{account ? 'Google-Zugriff aktualisieren' : 'Mit Google Kalender verbinden'}</Text>
      {connecting && <ActivityIndicator color={theme.accent} />}
    </TouchableOpacity>
    {error && <Text accessibilityRole="alert" style={[styles.description, { color: theme.isDark ? '#FF9A91' : '#B42318' }]}>{error}</Text>}
    {account && <TouchableOpacity accessibilityRole="button" onPress={() => { void refreshCalendars(); }} disabled={loadingCalendars} style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
      <Ionicons name="refresh-outline" size={20} color={theme.accent} />
      <Text style={[styles.title, { color: theme.text }]}>Kalenderliste aktualisieren</Text>
      {loadingCalendars && <ActivityIndicator color={theme.accent} />}
    </TouchableOpacity>}
    {calendars.map((calendar) => <View key={calendar.id} style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
      <View style={[styles.dot, { backgroundColor: calendar.backgroundColor || theme.accent }]} />
      <View style={styles.label}>
        <Text style={[styles.title, { color: theme.text }]}>{calendar.summaryOverride || calendar.summary}</Text>
        {calendar.primary && <Text style={[styles.description, { color: theme.subtext, marginBottom: 0 }]}>Hauptkalender</Text>}
      </View>
      <Switch accessibilityLabel={`${calendar.summaryOverride || calendar.summary} anzeigen`} value={selectedIds.includes(calendar.id)} trackColor={{ true: theme.accent }} onValueChange={(enabled) => {
        const current = useCalendarStore.getState().selectedIds;
        void selectCalendars(enabled ? [...current, calendar.id] : current.filter((id) => id !== calendar.id));
      }} />
    </View>)}
    {account && !loadingCalendars && !error && !calendars.length && <Text style={[styles.description, { color: theme.subtext }]}>Keine lesbaren Kalender gefunden.</Text>}
    {!!calendars.length && !selectedIds.length && <Text style={[styles.description, { color: theme.subtext }]}>Aktiviere mindestens einen Kalender, um Termine anzuzeigen.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 }, heading: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 },
  description: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 14, marginBottom: 8 },
  title: { fontSize: 15, fontWeight: '600', flexShrink: 1 }, label: { flex: 1 }, dot: { width: 10, height: 10, borderRadius: 5 },
});
