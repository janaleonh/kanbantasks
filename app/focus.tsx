import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useKanbanStore } from '../src/stores/useKanbanStore';
import { useFocusStore } from '../src/stores/useFocusStore';
import { remainingFocus } from '../src/tasks/focus';

export default function FocusScreen() {
  const theme = useTheme(), { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const { taskLists, tasksByList, loadAll, toggleTask } = useKanbanStore();
  const focus = useFocusStore();
  const [chosen, setChosen] = useState(taskId || ''), [minutes, setMinutes] = useState(25), [now, setNow] = useState(Date.now());
  useEffect(() => { void loadAll(); void focus.initialize(); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [loadAll, focus.initialize]);
  const tasks = taskLists.flatMap(list => tasksByList[list.id] || []).filter(task => task.status === 'needsAction' && !task.deletedLocally);
  const remaining = focus.session ? remainingFocus(focus.session, now) : null;
  const run = async (action: () => Promise<void>) => { try { await action(); } catch (err) { Alert.alert('Fokus', err instanceof Error ? err.message : 'Die Aktion konnte nicht ausgeführt werden.'); } };
  const complete = async () => {
    if (!focus.session) return;
    const id = focus.session.taskId;
    const task = Object.values(useKanbanStore.getState().tasksByList).flat().find(value => value.id === id);
    if (task?.status === 'needsAction') {
      await toggleTask(id);
      if (Object.values(useKanbanStore.getState().tasksByList).flat().find(value => value.id === id)?.status === 'needsAction') throw new Error('Die Aufgabe konnte nicht erledigt werden.');
    }
    await focus.end();
  };
  const button = (title: string, action: () => Promise<void>) => <TouchableOpacity accessibilityRole="button" disabled={focus.busy} onPress={() => { void run(action); }} style={{ padding: 15, borderRadius: 14, backgroundColor: theme.pillBg, alignItems: 'center', marginTop: 12 }}><Text style={{ color: theme.accent, fontWeight: '600' }}>{title}</Text></TouchableOpacity>;
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 24, paddingBottom: 45 }}><Stack.Screen options={{ headerShown: true, headerTitle: 'Fokus' }} />
    {focus.session ? <>
      <Text style={{ color: theme.subtext, textAlign: 'center', marginTop: 20 }}>JETZT IM FOKUS</Text>
      <Text style={{ color: theme.text, fontSize: 30, lineHeight: 39, fontWeight: '700', textAlign: 'center', marginVertical: 24 }}>{focus.session.title}</Text>
      <Text style={{ color: theme.accent, fontSize: 60, fontVariant: ['tabular-nums'], textAlign: 'center' }}>{remaining === null ? '∞' : `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`}</Text>
      <Text style={{ color: theme.subtext, textAlign: 'center', marginVertical: 14 }}>{remaining === 0 ? 'Die Fokuszeit ist vorbei.' : focus.session.paused !== null ? 'Pausiert' : remaining === null ? 'Ohne Zeitlimit' : 'Dein Timer läuft auch beim Verlassen der Ansicht weiter.'}</Text>
      {!!focus.session.duration && remaining !== 0 && button(focus.session.paused !== null ? 'Fortsetzen' : 'Pausieren', focus.session.paused !== null ? focus.resume : focus.pause)}
      {button('Aufgabe erledigen', complete)}
      {button('Fokus beenden', focus.end)}
    </> : <>
      <Text style={{ color: theme.text, fontSize: 25, fontWeight: '700', marginBottom: 12 }}>Eine Aufgabe. Ein klarer Fokus.</Text>
      <Text style={{ color: theme.subtext, lineHeight: 21, marginBottom: 20 }}>Wähle eine offene Aufgabe und optional einen Timer. Aufgaben werden dadurch nicht in deinen Kalender eingeplant.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 22 }}>{[0, 5, 15, 25, 50].map(value => <TouchableOpacity key={value} onPress={() => setMinutes(value)} style={{ padding: 11, borderRadius: 10, backgroundColor: minutes === value ? theme.accent : theme.cardBg }}><Text style={{ color: minutes === value ? theme.onAccent ?? '#fff' : theme.text }}>{value ? `${value} Min.` : 'Ohne Timer'}</Text></TouchableOpacity>)}</View>
      {tasks.map(task => <TouchableOpacity key={task.id} onPress={() => setChosen(task.id)} style={{ padding: 15, borderWidth: 1, borderColor: chosen === task.id ? theme.accent : theme.border, borderRadius: theme.cardRadius, backgroundColor: theme.cardBg, marginBottom: 9 }}><Text style={{ color: theme.text }}>{chosen === task.id ? '● ' : ''}{task.title}</Text></TouchableOpacity>)}
      {!tasks.length && <Text style={{ color: theme.subtext }}>Keine offenen Aufgaben verfügbar.</Text>}
      {chosen && button('Fokus starten', () => focus.start(chosen, minutes))}
    </>}
    {!!focus.error && <Text style={{ color: theme.subtext, marginTop: 20 }}>{focus.error}</Text>}
  </ScrollView>;
}
