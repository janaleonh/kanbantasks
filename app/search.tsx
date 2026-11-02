import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useKanbanStore } from '../src/stores/useKanbanStore';
import { useDocumentStore } from '../src/stores/useDocumentStore';
import { useCalendarStore } from '../src/stores/useCalendarStore';
import { searchPlanner } from '../src/tasks/search';
import { eventTimeLabel } from '../src/calendar/dates';

export default function SearchScreen() {
  const theme = useTheme(), router = useRouter();
  const { project, tag } = useLocalSearchParams<{ project?: string; tag?: string }>();
  const [query, setQuery] = useState('');
  const { taskLists, tasksByList, loadAll } = useKanbanStore();
  const { manifest, initialize } = useDocumentStore();
  const { eventsByMonth, selectedIds } = useCalendarStore();
  useEffect(() => { void loadAll(); void initialize(); }, [loadAll, initialize]);
  const results = useMemo(() => searchPlanner(taskLists, tasksByList, manifest, Object.values(eventsByMonth).flat().filter(event => selectedIds.includes(event.calendarId)), query, project, tag), [taskLists, tasksByList, manifest, eventsByMonth, selectedIds, query, project, tag]);
  const card = { backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1, borderRadius: theme.cardRadius, padding: 14, marginBottom: 9 };
  const heading = { color: theme.subtext, marginTop: 16, marginBottom: 10, fontWeight: '600' as const };
  return <View style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ headerShown: true, headerTitle: project || (tag ? `#${tag}` : 'Globale Suche') }} />
    <TextInput accessibilityLabel="In Planner suchen" placeholder="Aufgaben, Notizen, Dokumentnamen …" placeholderTextColor={theme.subtext} value={query} onChangeText={setQuery} style={{ margin: 16, padding: 14, fontSize: 16, borderRadius: 12, backgroundColor: theme.inputBg, color: theme.text }} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
      <Text style={{ color: theme.subtext, fontSize: 12, lineHeight: 19 }}>Suche in lokalen Aufgaben aller Listen, bekannten NAS-Dateinamen und geladenen Kalenderterminen. Dateiinhalte werden nicht durchsucht.</Text>
      <Text style={heading}>AUFGABEN · {results.tasks.length}</Text>
      {results.tasks.slice(0, 100).map(({ task, listTitle }) => <TouchableOpacity key={task.id} style={card} onPress={() => router.push({ pathname: '/task', params: { id: task.id } })}><Text style={{ color: theme.text, fontWeight: '600' }}>{task.status === 'completed' ? '✓ ' : ''}{task.title}</Text><Text style={{ color: theme.subtext, fontSize: 12, marginTop: 5 }}>{[listTitle, task.project, ...(task.tags || []).map(value => `#${value}`)].filter(Boolean).join(' · ')}</Text></TouchableOpacity>)}
      {!!results.documents.length && <Text style={heading}>NAS-DOKUMENTE · {results.documents.length}</Text>}
      {results.documents.slice(0, 100).map(entry => <TouchableOpacity key={entry.path} style={card} onPress={() => router.push({ pathname: '/document', params: { path: entry.path } })}><Text style={{ color: theme.text }}>{entry.name}</Text><Text style={{ color: theme.subtext, fontSize: 12, marginTop: 5 }}>{entry.path}</Text></TouchableOpacity>)}
      {!!results.events.length && <Text style={heading}>TERMINE · {results.events.length}</Text>}
      {results.events.slice(0, 100).map(event => <TouchableOpacity key={event.id} style={card} onPress={() => router.push({ pathname: '/event', params: { calendarId: event.calendarId, eventId: event.eventId } })}><Text style={{ color: theme.text }}>{event.title}</Text><Text style={{ color: theme.subtext, fontSize: 12, marginTop: 5 }}>{eventTimeLabel(event)} · {event.calendarTitle}</Text></TouchableOpacity>)}
      {results.tasks.length > 100 || results.documents.length > 100 || results.events.length > 100 ? <Text style={{ color: theme.subtext }}>Die ersten 100 Treffer pro Bereich werden angezeigt. Verfeinere die Suche.</Text> : null}
    </ScrollView>
  </View>;
}
