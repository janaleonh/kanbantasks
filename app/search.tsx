import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useKanbanStore } from '../src/stores/useKanbanStore';
import { useDocumentStore } from '../src/stores/useDocumentStore';
import { useCalendarStore } from '../src/stores/useCalendarStore';
import { searchMatcher, searchPlanner } from '../src/tasks/search';
import { eventTimeLabel } from '../src/calendar/dates';

import { projectItems,type ProjectItem } from '../src/components/ProjectAssignment';
import { listNotes, type Note } from '../src/notes/library';
import { getScans, type ScanRecord } from '../src/documents/scans';

export default function SearchScreen() {
  const theme = useTheme(), router = useRouter();
  const { project, tag } = useLocalSearchParams<{ project?: string; tag?: string }>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Alle');
  const [notes,setNotes] = useState<Note[]>([]);
  useEffect(() => { let live=true; void listNotes().then(rows=>{if(live)setNotes(rows);}).catch(()=>{}); return ()=>{live=false;}; }, []);
  const owner=useDocumentStore(s=>s.config?.id??'');
  const [links,setLinks]=useState<ProjectItem[]>([]);
  useEffect(()=>{let live=true;if(project)void projectItems(owner).then(rows=>{if(live)setLinks(rows.filter(i=>i.project===project));}).catch(()=>{});return()=>{live=false;};},[owner,project]);
  const projectDocs=project ? links.filter(l=>l.kind==='document' && l.owner===owner && searchMatcher(query)(l.item)) : [];
  const matchingNotes = useMemo(() => {
    const matches = searchMatcher(query);
    return tag ? [] : notes.filter(n => (!project || links.some(l=>l.kind==='note' && l.item===n.id)) && n.state !== 'trash' && matches([n.title,n.body,n.folder,n.tags].join(' ')));
  },[project,tag,notes,query,links]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  useEffect(() => { let active = true; void getScans().then(rows => { if (active) setScans(rows); }).catch(() => {}); return () => { active = false; }; }, []);
  const local = useMemo(() => {
    const matches = searchMatcher(query);
    return project || tag ? [] : scans.filter(scan => matches(scan.name + ' ' + (scan.content ?? '')));
  }, [scans, project, tag, query]);
  const show = (type: string) => filter === 'Alle' || filter === type;
  const { taskLists, tasksByList, loadAll } = useKanbanStore();
  const { manifest, initialize } = useDocumentStore();
  const { eventsByMonth, selectedIds } = useCalendarStore();
  useEffect(() => { void loadAll(); void initialize(); }, [loadAll, initialize]);
  const results = useMemo(() => searchPlanner(taskLists, tasksByList, manifest, Object.values(eventsByMonth).flat().filter(event => selectedIds.includes(event.calendarId)), query, project, tag), [taskLists, tasksByList, manifest, eventsByMonth, selectedIds, query, project, tag]);
  const card = { backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1, borderRadius: theme.cardRadius, padding: 14, marginBottom: 9 };
  const heading = { color: theme.subtext, marginTop: 16, marginBottom: 10, fontWeight: '600' as const };
  return <View style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ headerShown: true, headerTitle: project || (tag ? `#${tag}` : 'Globale Suche') }} />
    <TextInput accessibilityLabel="In Planner suchen" placeholder="Aufgaben, Notizen, Dokumentnamen …" placeholderTextColor={theme.subtext} value={query} onChangeText={setQuery} style={{ margin: 16, padding: 14, fontSize: 16, borderRadius: 12, backgroundColor: theme.inputBg, color: theme.text }} />
    {!project && !tag && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 12 }}>
      {['Alle','Aufgaben','Termine','Notizen','Dokumente'].map(label => <TouchableOpacity key={label} accessibilityRole="button" accessibilityState={{selected:filter === label}} onPress={() => setFilter(label)} style={{ padding: 9, borderRadius: 12, backgroundColor: filter === label ? theme.accent : theme.pillBg }}><Text style={{color:filter === label ? theme.onAccent ?? '#fff' : theme.text}}>{label}</Text></TouchableOpacity>)}
    </View>}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
      <Text style={{ color: theme.subtext, fontSize: 12, lineHeight: 19 }}>Suche in lokalen Aufgaben aller Listen, bekannten NAS-Dateinamen und geladenen Kalenderterminen. Neue lokale Scans werden auch nach erkanntem Text durchsucht.</Text>
      {show('Aufgaben') && <Text style={heading}>AUFGABEN · {results.tasks.length}</Text>}
      {show('Aufgaben') && results.tasks.slice(0, 100).map(({ task, listTitle }) => <TouchableOpacity key={task.id} style={card} onPress={() => router.push({ pathname: '/task', params: { id: task.id } })}><Text style={{ color: theme.text, fontWeight: '600' }}>{task.status === 'completed' ? '✓ ' : ''}{task.title}</Text><Text style={{ color: theme.subtext, fontSize: 12, marginTop: 5 }}>{[listTitle, task.project, ...(task.tags || []).map(value => `#${value}`)].filter(Boolean).join(' · ')}</Text></TouchableOpacity>)}
      {show('Dokumente') && !!results.documents.length && <Text style={heading}>NAS-DOKUMENTE · {results.documents.length}</Text>}
      {show('Dokumente') && results.documents.slice(0, 100).map(entry => <TouchableOpacity key={entry.path} style={card} onPress={() => router.push({ pathname: '/document', params: { path: entry.path } })}><Text style={{ color: theme.text }}>{entry.name}</Text><Text style={{ color: theme.subtext, fontSize: 12, marginTop: 5 }}>{entry.path}</Text></TouchableOpacity>)}
      {show('Termine') && !!results.events.length && <Text style={heading}>TERMINE · {results.events.length}</Text>}
      {show('Termine') && results.events.slice(0, 100).map(event => <TouchableOpacity key={event.id} style={card} onPress={() => router.push({ pathname: '/event', params: { calendarId: event.calendarId, eventId: event.eventId } })}><Text style={{ color: theme.text }}>{event.title}</Text><Text style={{ color: theme.subtext, fontSize: 12, marginTop: 5 }}>{eventTimeLabel(event)} · {event.calendarTitle}</Text></TouchableOpacity>)}
      {projectDocs.map(doc=><TouchableOpacity key={doc.item} style={card} onPress={()=>router.push({pathname:'/document',params:{path:doc.item,projectOwner:doc.owner}})}><Text style={{color:theme.text}}>Dokument · {doc.item}</Text></TouchableOpacity>)}
      {show('Notizen') && matchingNotes.length > 0 && <Text style={heading}>NOTIZEN · {matchingNotes.length}</Text>}
      {show('Notizen') && matchingNotes.slice(0,100).map(n=><TouchableOpacity key={n.id} style={card} onPress={()=>router.push({pathname:'/note',params:{id:n.id}})}><Text style={{color:theme.text}}>{n.title||'Ohne Titel'}</Text><Text numberOfLines={2} style={{color:theme.subtext}}>{n.body}</Text></TouchableOpacity>)}
      {show('Dokumente') && local.length > 0 && <Text style={heading}>LOKALE SCANS · {local.length}</Text>}
      {show('Dokumente') && local.map(scan => <TouchableOpacity key={scan.id} style={card} onPress={() => router.push({pathname:'/scan',params:{id:scan.id}})}><Text style={{color:theme.text}}>{scan.name}</Text></TouchableOpacity>)}
      {!projectDocs.length && ((!show('Notizen') || !matchingNotes.length) && (!show('Aufgaben') || !results.tasks.length) && (!show('Termine') || !results.events.length) && (!show('Dokumente') || !(local.length || results.documents.length))) && <Text style={heading}>Keine Treffer</Text>}
      {results.tasks.length > 100 || results.documents.length > 100 || results.events.length > 100 ? <Text style={{ color: theme.subtext }}>Die ersten 100 Treffer pro Bereich werden angezeigt. Verfeinere die Suche.</Text> : null}
    </ScrollView>
  </View>;
}
