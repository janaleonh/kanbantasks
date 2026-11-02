import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { getHistory, restoreHistory, type HistoryEntry } from '../src/db/history';
import { useTheme } from '../src/hooks/useTheme';
import { useKanbanStore } from '../src/stores/useKanbanStore';

const taskTitle = (entry: HistoryEntry) => { try { return JSON.parse(entry.beforeJson)?.task?.title || ''; } catch { return ''; } };

export default function HistoryScreen() {
  const theme = useTheme();
  const [entries, setEntries] = useState<HistoryEntry[]>([]), [busy, setBusy] = useState(false);
  const load = useCallback(() => { void getHistory().then(setEntries).catch(() => Alert.alert('Verlauf', 'Der Verlauf konnte nicht geladen werden.')); }, []);
  useFocusEffect(load);
  const restore = async (entry: HistoryEntry, copy: boolean) => {
    if (busy) return; setBusy(true);
    try { await restoreHistory(entry.id, copy); await useKanbanStore.getState().loadAll(); useKanbanStore.getState().scheduleSync(); load(); }
    catch (err) { Alert.alert('Wiederherstellen', err instanceof Error ? err.message : 'Der Eintrag konnte nicht wiederhergestellt werden.'); }
    finally { setBusy(false); }
  };
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ headerShown: true, headerTitle: 'Verlauf & Papierkorb' }} />
    <FlatList data={entries} keyExtractor={entry => entry.id} contentContainerStyle={{ padding: 18, paddingBottom: 40 }} ListHeaderComponent={<Text style={{ color: theme.subtext, lineHeight: 20, marginBottom: 18 }}>Die letzten 100 Änderungen. Neuere Änderungen werden nicht überschrieben. Gelöschte Listen werden als neue Listen wiederhergestellt. Bei Wiederholungen bleibt eine bereits erzeugte Folgeaufgabe erhalten.</Text>} ListEmptyComponent={<Text style={{ color: theme.subtext }}>Noch keine Änderungen im Verlauf.</Text>} renderItem={({ item }) => <View style={{ padding: 15, borderWidth: 1, borderColor: theme.border, borderRadius: theme.cardRadius, backgroundColor: theme.cardBg, marginBottom: 12, gap: 10 }}>
      <Text style={{ color: theme.text, fontWeight: '600' }}>{item.label}</Text>{!!taskTitle(item) && <Text style={{ color: theme.text }}>{taskTitle(item)}</Text>}<Text style={{ color: theme.subtext, fontSize: 12 }}>{new Date(item.createdAt).toLocaleString('de-DE')}{item.undone ? ' · Wiederhergestellt' : ''}</Text>
      {!item.undone && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}><TouchableOpacity disabled={busy} onPress={() => { void restore(item, false); }}><Text style={{ color: theme.accent }}>Wiederherstellen</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => { void restore(item, true); }}><Text style={{ color: theme.accent }}>Als neue Kopie</Text></TouchableOpacity></View>}
    </View>} />
  </View>;
}
