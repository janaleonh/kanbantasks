import React, { useCallback,useEffect,useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter,useFocusEffect } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useKanbanStore } from '../src/stores/useKanbanStore';

import { projectItems,type ProjectItem } from '../src/components/ProjectAssignment';
import { useDocumentStore } from '../src/stores/useDocumentStore';
export default function ProjectsScreen() {
  const theme = useTheme(), router = useRouter();
  const { taskLists, tasksByList, loadAll } = useKanbanStore();
  useEffect(() => { void loadAll(); }, [loadAll]);
  const owner=useDocumentStore(s=>s.config?.id??'');
  const [items,setItems]=useState<ProjectItem[]>([]);
  useFocusEffect(useCallback(()=>{let live=true;void projectItems(owner).then(values=>{if(live)setItems(values);}).catch(()=>{});return()=>{live=false;};},[owner]));
  const tasks = taskLists.flatMap(list => tasksByList[list.id] || []).filter(task => !task.deletedLocally);
  const projects = [...new Set([...items.map(i=>i.project),...tasks.map(task => task.project).filter((value): value is string => !!value)])].sort();
  const tags = [...new Set(tasks.flatMap(task => task.tags || []))].sort();
  const render = (name: string, type: 'project' | 'tag') => {
    const matching = tasks.filter(task => type === 'project' ? task.project === name : task.tags?.includes(name));
    return <TouchableOpacity key={name} onPress={() => router.push({ pathname: '/search', params: { [type]: name } })} style={{ padding: 16, backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border, borderRadius: theme.cardRadius, marginBottom: 10 }}><Text style={{ color: theme.text, fontWeight: '600' }}>{type === 'tag' ? '#' : ''}{name}</Text><Text style={{ color: theme.subtext, fontSize: 12, marginTop: 5 }}>{matching.filter(task => task.status === 'needsAction').length} offen · {matching.length} Aufgaben{type==='project' ? ` · ${items.filter(i=>i.project===name && i.kind==='note').length} Notizen · ${items.filter(i=>i.project===name && i.kind==='document').length} Dokumente` : ''}</Text></TouchableOpacity>;
  };
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}><Stack.Screen options={{ headerShown: true, headerTitle: 'Projekte & Tags' }} />
    <Text style={{ color: theme.subtext, lineHeight: 20, marginBottom: 18 }}>Ordne Aufgaben, Notizen und NAS-Dokumente demselben Projektnamen zu.</Text>
    <Text style={{ color: theme.subtext, marginBottom: 12 }}>PROJEKTE</Text>{projects.map(name => render(name, 'project'))}
    {!projects.length && <Text style={{ color: theme.subtext }}>Noch keine Projekte vergeben.</Text>}
    <Text style={{ color: theme.subtext, marginVertical: 16 }}>TAGS</Text>{tags.map(name => render(name, 'tag'))}
    {!tags.length && <Text style={{ color: theme.subtext }}>Noch keine Tags vergeben.</Text>}
  </ScrollView>;
}
