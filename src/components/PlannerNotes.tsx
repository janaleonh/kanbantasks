import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDatabase } from '../db/database';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { createFromTemplate, deleteTemplate, listTemplates, type TemplateSummary, blankNote, listNotes, saveNote, trashNote, type Note } from '../notes/library';
import { pendingShares } from '../notes/incoming';
import { searchMatcher } from '../tasks/search';

export function PlannerNotes({initialFolder=''}: {initialFolder?:string}) {
  const theme = useTheme(), router = useRouter();
  const [notes,setNotes] = useState<Note[]>([]), [query,setQuery] = useState(''), [folder,setFolder]=useState(initialFolder);
  const [state,setState] = useState<Note['state']>('active'), [sort,setSort]=useState(false);
  const [templates,setTemplates]=useState<TemplateSummary[]>([]);
  const [showTemplates,setShowTemplates]=useState(false);
  const creating=useRef(false);
  const [pending,setPending]=useState<string[]>([]);
  useFocusEffect(useCallback(() => {
    let live=true;
    try {setPending(pendingShares());} catch {setPending([]);}
    void listTemplates().then(rows=>{if(live)setTemplates(rows);}).catch(()=>Alert.alert('Vorlagen konnten nicht geladen werden.'));
    void listNotes().then(rows => { if(live) setNotes(rows); }).catch(() => Alert.alert('Notizen konnten nicht geladen werden.'));
    return () => { live=false; };
  },[]));
  const rows = useMemo(() => {
    const matches = searchMatcher(query);
    const filtered = notes.filter(n => n.state===state && (!folder || n.folder===folder) && matches([n.title,n.body,n.tags,n.folder].join(' ')));
    return sort ? filtered.sort((a,b)=>b.pinned-a.pinned || a.title.localeCompare(b.title,'de')) : filtered;
  },[notes,query,state,folder,sort]);
  const folders = [...new Set(notes.filter(n=>n.state===state && n.folder).map(n=>n.folder))];
  const button=(label:string,action:()=>void,selected=false) => <TouchableOpacity key={label} accessibilityRole="button" onPress={action} style={{padding:10,borderRadius:12,backgroundColor:selected?theme.accent:theme.pillBg}}><Text style={{color:selected?theme.onAccent:theme.text}}>{label}</Text></TouchableOpacity>;
  const [undo,setUndo] = useState<{note:Note; stamp:string}|null>(null);
  useEffect(()=>{ if(!undo)return; const timer=setTimeout(()=>setUndo(null),7000);return ()=>clearTimeout(timer); },[undo]);
  const restore = async () => {
    if(!undo)return;
    try {
      const db=await getDatabase();
      await db.runAsync("UPDATE notes SET state=?,updatedAt=? WHERE id=? AND state='trash' AND updatedAt=?", [undo.note.state,undo.note.updatedAt,undo.note.id,undo.stamp]);
      setNotes(await listNotes()); setUndo(null);
    } catch {Alert.alert('Wiederherstellen fehlgeschlagen');}
  };
  const trashing = useRef(new Set<string>());
  const moveToTrash = async (id: string) => {
    if (trashing.current.has(id)) return;
    trashing.current.add(id);
    try {
      const updatedAt = await trashNote(id);
      const previous=notes.find(n=>n.id===id); if(previous)setUndo({note:previous,stamp:updatedAt});
      setNotes(current => current.map(note => note.id === id ? {...note, state:'trash', updatedAt} : note));
    } catch {
      Alert.alert('Die Notiz konnte nicht in den Papierkorb verschoben werden.');
    } finally {
      trashing.current.delete(id);
    }
  };
  async function pin(note:Note) {
    try {
      const db=await getDatabase();
      await db.runAsync("UPDATE notes SET pinned=? WHERE id=? AND state!='trash'",[note.pinned?0:1,note.id]);
      setNotes(await listNotes());
    } catch {Alert.alert('Anheften konnte nicht geändert werden.');}
  }
  const create=async (shopping=false) => {
    const note=blankNote(); note.folder=folder;
    if(shopping){note.title='Einkaufsliste';note.tags='#Einkaufsliste';}
    await saveNote(note); router.push({pathname:'/note',params:{id:note.id}});
  };
  return <View style={{flex:1}}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12,paddingBottom:60}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{color:theme.text,fontWeight:'700',fontSize:23}}>Notizen</Text>{button('＋ Neue Notiz',()=>void create().catch(()=>Alert.alert('Anlegen fehlgeschlagen')),true)}</View>
    {button('＋ Einkaufsliste',()=>void create(true).catch(()=>Alert.alert('Anlegen fehlgeschlagen')))}
    {templates.length>0 && button(showTemplates?'Vorlagen schließen':'Aus Vorlage',()=>setShowTemplates(!showTemplates))}
    {showTemplates && templates.map(t=><View key={t.id} style={{flexDirection:'row',gap:8,alignItems:'center',backgroundColor:theme.cardBg,padding:10,borderRadius:theme.cardRadius}}>
      <TouchableOpacity accessibilityRole="button" style={{flex:1,padding:8}} onPress={async()=>{
        if(creating.current)return;creating.current=true;
        try {const note=await createFromTemplate(t.id,folder);setShowTemplates(false);router.push({pathname:'/note',params:{id:note.id}});}
        catch(e){Alert.alert('Vorlage',e instanceof Error?e.message:'Anlegen fehlgeschlagen.');}
        finally{creating.current=false;}
      }}><Text style={{color:theme.accent,fontWeight:'600'}}>Neue Notiz aus {t.title}</Text></TouchableOpacity>
      {button('Entfernen',()=>Alert.alert('Vorlage entfernen?',t.title,[{text:'Abbrechen',style:'cancel'},{text:'Entfernen',style:'destructive',onPress:()=>void deleteTemplate(t.id).then(()=>setTemplates(items=>items.filter(item=>item.id!==t.id))).catch(()=>Alert.alert('Entfernen fehlgeschlagen.'))}]))}
    </View>)}
    {pending.map((delivery,i)=>button('Geteilten Inhalt übernehmen · '+(i+1),()=>router.push({pathname:'/receive',params:{delivery}})))}
    <TextInput placeholder="Titel, Text oder Tag suchen" accessibilityLabel="Notizen durchsuchen" value={query} onChangeText={setQuery} placeholderTextColor={theme.subtext} style={{color:theme.text,backgroundColor:theme.inputBg,padding:12,borderRadius:12}}/>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{([['active','Notizen'],['archived','Archiv'],['trash','Papierkorb']] as const).map(([key,label])=>button(label,()=>{setState(key);setFolder('');},state===key))}{button(sort?'A–Z':'Zuletzt bearbeitet',()=>setSort(!sort))}</View>
    {folders.length>0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:6}}>{button('Alle Ordner',()=>setFolder(''),!folder)}{folders.map(name=>button(name,()=>setFolder(name),folder===name))}</ScrollView>}
    {rows.map(n=><Swipeable key={n.state + n.id} enabled={n.state !== 'trash'} overshootRight={false} rightThreshold={70}
      overshootLeft={false} leftThreshold={50}
      onSwipeableOpen={direction => {if(direction==='left')void moveToTrash(n.id);}}
      renderLeftActions={(_progress,_drag,actions)=><TouchableOpacity accessibilityRole="button" onPress={()=>{actions.close();void pin(n);}}
        style={{width:102,alignItems:'center',justifyContent:'center',backgroundColor:theme.accent,borderRadius:theme.cardRadius}}>
        <Text style={{color:theme.onAccent,fontWeight:'700'}}>{n.pinned?'Lösen':'Anheften'}</Text>
      </TouchableOpacity>}
      renderRightActions={() => <TouchableOpacity accessibilityRole="button" accessibilityLabel="In den Papierkorb verschieben"
        onPress={() => void moveToTrash(n.id)} style={{width:110,alignItems:'center',justifyContent:'center',backgroundColor:'#A02E37',borderRadius:theme.cardRadius}}>
        <Text style={{color:'#fff',fontWeight:'700'}}>Papierkorb</Text>
      </TouchableOpacity>}>
      <TouchableOpacity accessibilityActions={n.state === 'trash' ? [] : [{name:'pin',label:n.pinned?'Lösen':'Anheften'},{name:'trash',label:'In den Papierkorb verschieben'}]}
        onAccessibilityAction={event => { if(event.nativeEvent.actionName==='pin' && n.state!=='trash') void pin(n); if(event.nativeEvent.actionName==='trash' && n.state!=='trash') void moveToTrash(n.id); }} onPress={()=>router.push({pathname:'/note',params:{id:n.id}})} style={{padding:16,borderRadius:theme.cardRadius,backgroundColor:theme.cardBg,gap:5}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
        <View style={{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:theme.pillBg}}>
          <Ionicons name={n.tags.includes('#Einkaufsliste')?'cart-outline':'document-text-outline'} size={18} color={theme.accent}/>
        </View>
        <Text numberOfLines={2} style={{flex:1,color:theme.text,fontWeight:'700',fontSize:17}}>{n.title||'Ohne Titel'}</Text>
        {!!n.pinned && <Ionicons accessibilityLabel="Angeheftet" name="pin" size={16} color={theme.accent}/>}
      </View>
      {!!n.body && <Text numberOfLines={2} style={{color:theme.subtext}}>{n.body}</Text>}
      <Text style={{color:theme.subtext,fontSize:12}}>{[n.folder,n.tags,new Date(n.updatedAt).toLocaleDateString('de-DE')].filter(Boolean).join(' · ')}</Text>
    </TouchableOpacity></Swipeable>)}
    {!rows.length && <Text style={{color:theme.subtext}}>{query?'Keine passenden Notizen.':state==='trash'?'Der Papierkorb ist leer.':state==='archived'?'Keine archivierten Notizen.':'Hier kannst du deine erste Notiz anlegen.'}</Text>}
  </ScrollView>{undo && <TouchableOpacity accessibilityRole="button" onPress={()=>void restore()} style={{padding:14,backgroundColor:theme.pillBg}}><Text style={{color:theme.accent}}>In den Papierkorb verschoben · Rückgängig</Text></TouchableOpacity>}</View>;
}
