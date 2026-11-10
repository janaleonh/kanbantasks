import React, { useState } from 'react';
import { requireOptionalNativeModule } from 'expo';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useWidgetStatus } from '../widgets/status';
import { refreshWidgets } from '../widgets/syncWidgets';

export function WidgetPreferences() {
  const theme = useTheme();
  const { state, message, updatedAt } = useWidgetStatus();
  const busy = state === 'loading';
  const [installed, setInstalled] = useState('');
  const inspect = async () => {
    const module = requireOptionalNativeModule<{installedKinds: () => Promise<string[]>}>('PlannerWidgetDiagnostics');
    if (!module) { setInstalled('Für die Geräteprüfung ist ein neuer iOS-Build erforderlich.'); return; }
    try {
      const kinds = await module.installedKinds();
      const labels = [...new Set(kinds.filter(kind => kind === 'TodayTasks' || kind === 'TasksOverview').map(kind => kind === 'TodayTasks' ? 'Heute' : 'Aufgabenübersicht'))];
      setInstalled(labels.length ? 'Von iOS gemeldet: ' + labels.join(', ') : 'iOS meldet kein platziertes Planner-Widget. Füge eines auf dem Home- oder Sperrbildschirm hinzu.');
    } catch { setInstalled('iOS konnte die platzierten Widgets nicht auslesen.'); }
  };
  return <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border, borderRadius: theme.cardRadius }]}>
    <Text style={[styles.title, { color: theme.text }]}>iPhone-Widgets</Text>
    <Text accessibilityRole={state === 'blocked' || state === 'error' ? 'alert' : undefined} style={[styles.description, { color: theme.subtext }]}>{message}</Text>
    <Text style={[styles.description, { color: theme.subtext }]}>„Heute“ zählt heute fällige und überfällige Aufgaben sowie Aufgaben ohne Datum in deiner Heute-Liste. Die Übersicht zählt alle offenen Aufgaben in sichtbaren Listen.</Text>
    {state !== 'unavailable' && <TouchableOpacity accessibilityRole="button" onPress={()=>void inspect()} style={styles.button}><Text style={{color:theme.accent}}>Platzierte Widgets prüfen</Text></TouchableOpacity>}
    {!!installed && <Text accessibilityLiveRegion="polite" style={[styles.description,{color:theme.subtext}]}>{installed}</Text>}
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
