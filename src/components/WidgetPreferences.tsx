import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useWidgetStatus } from '../widgets/status';
import { refreshWidgets } from '../widgets/syncWidgets';

export function WidgetPreferences() {
  const theme = useTheme();
  const { state, message, updatedAt } = useWidgetStatus();
  const busy = state === 'loading';
  return <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border, borderRadius: theme.cardRadius }]}>
    <Text style={[styles.title, { color: theme.text }]}>iPhone-Widgets</Text>
    <Text accessibilityRole={state === 'blocked' || state === 'error' ? 'alert' : undefined} style={[styles.description, { color: theme.subtext }]}>{message}</Text>
    <Text style={[styles.description, { color: theme.subtext }]}>„Heute“ zeigt offene Aufgaben mit heutigem oder überfälligem Datum. Ohne Fälligkeitsdatum erscheinen sie in der Aufgabenübersicht. Es zählen deine sichtbaren Listen.</Text>
    {updatedAt && <Text style={[styles.description, { color: theme.subtext }]}>Zuletzt bereitgestellt: {new Date(updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</Text>}
    <TouchableOpacity accessibilityRole="button" disabled={busy || state === 'unavailable'} onPress={() => { void refreshWidgets(true); }} style={[styles.button, { backgroundColor: theme.pillBg, opacity: busy || state === 'unavailable' ? 0.5 : 1 }]}>
      {busy ? <ActivityIndicator color={theme.accent} /> : <Ionicons name="refresh-outline" size={18} color={theme.accent} />}
      <Text style={{ color: theme.accent, fontWeight: '600' }}>Widgets aktualisieren</Text>
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 16, borderWidth: 1, marginBottom: 14 }, title: { fontSize: 16, fontWeight: '600' },
  description: { fontSize: 13, lineHeight: 20, marginTop: 8 }, button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, marginTop: 13 },
});
