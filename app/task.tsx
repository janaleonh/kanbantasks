import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { EditTaskModal } from '../src/components/EditTaskModal';
import { getTaskById, type Task } from '../src/db/taskRepo';
import { useKanbanStore } from '../src/stores/useKanbanStore';
import { useTheme } from '../src/hooks/useTheme';

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), router = useRouter(), theme = useTheme();
  const [task, setTask] = useState<Task | null>(null), [loaded, setLoaded] = useState(false);
  const { taskLists, loadAll, updateTask, moveTask, removeTask } = useKanbanStore();
  useEffect(() => { let active = true; void loadAll().then(() => getTaskById(id)).then(value => { if (active) { setTask(value?.deletedLocally ? null : value); setLoaded(true); } }).catch(() => { if (active) setLoaded(true); }); return () => { active = false; }; }, [id, loadAll]);
  const close = () => router.canGoBack() ? router.back() : router.replace('/');
  return <View style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ headerShown: true, headerTitle: 'Aufgabe' }} />
    {!loaded ? <ActivityIndicator color={theme.accent} /> : !task ? <Text style={{ color: theme.subtext, padding: 24 }}>Diese Aufgabe ist nicht mehr verfügbar.</Text> : <EditTaskModal task={task} visible taskLists={taskLists} onClose={close} onSave={updateTask} onMoveTask={moveTask} onDelete={removeTask} />}
  </View>;
}
