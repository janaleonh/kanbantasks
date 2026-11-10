import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, Share, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Picker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { saveTemplate, attachFiles, attachmentFile, noteFiles, purgeNote, noteVersions, type NoteVersion, readNote, removeAttachment, saveNote, type Attachment, type Note } from '../src/notes/library';
import { ProjectAssignment } from '../src/components/ProjectAssignment';
import { captureTask } from '../src/db/taskRepo';
import { generateUUID } from '../src/utils/uuid';
import { useKanbanStore } from '../src/stores/useKanbanStore';
import { RichNoteEditor } from '../src/components/RichNoteEditor';
import { useTheme } from '../src/hooks/useTheme';

import { ShoppingList } from '../src/components/ShoppingList';

export default function NoteEditor() {
  const {id}=useLocalSearchParams<{id:string}>(), theme=useTheme(), router=useRouter();
  const [note,setNote]=useState<Note|null>(null), [files,setFiles]=useState<Attachment[]>([]), [editorKey,resetEditor]=useState(0);
  const [status,setStatus]=useState('Lädt …'), [busy,setBusy]=useState(false);
  const [menu,setMenu]=useState(false),[height,setHeight]=useState(450);
  const [versions,setVersions]=useState<NoteVersion[]|null>(null);
  const draft=useRef<Note|null>(null), version=useRef(0), writes=useRef(Promise.resolve());
  const undo=useRef<string[]>([]), redo=useRef<string[]>([]);
  useEffect(()=>{
    let active=true;
    void Promise.all([readNote(id),noteFiles(id)]).then(([row,attachments])=>{
      if(active){ draft.current=row; setNote(row);setFiles(attachments);setStatus(row?'Gespeichert':'Notiz nicht gefunden.'); }
    }).catch(()=>{if(active)setStatus('Laden fehlgeschlagen.');});
    return ()=>{active=false;};
  },[id]);
  function update(patch:Partial<Note>,history=true) {
    if(!draft.current) return Promise.resolve();
    const last=draft.current;
    if(!history && patch.body!==undefined)resetEditor(n=>n+1);
    if(history && patch.body!==undefined && patch.body!==last.body){undo.current=[...undo.current.slice(-19),last.body];redo.current=[];}
    const next={...last,...patch}; draft.current=next; setNote(next);setStatus('Speichert …');
    const v=++version.current;
    const operation=writes.current.then(async()=>{if(v===version.current) await saveNote(next);});
    writes.current=operation.catch(()=>{});
    void operation.then(()=>{if(v===version.current)setStatus('Gespeichert');},()=>{if(v===version.current)setStatus('Speichern fehlgeschlagen · erneut versuchen');});
    return operation;
  }
  const creatingTask = useRef(false);
  const [createdTask,setCreatedTask]=useState<string|null>(null);
  async function fromSelection(selection:string) {
    const text=selection.trim();
    if(!text || creatingTask.current || draft.current?.state==='trash')return;
    if(text.length>20000){Alert.alert('Bitte markiere höchstens 20.000 Zeichen.');return;}
    const title=text.split(/\r?\n/)[0].slice(0,1000);
    creatingTask.current=true;
    try {
      await writes.current;
      const taskId=await captureTask(title,text===title?'':text,null,'note:'+generateUUID(),undefined,id);
      setCreatedTask(taskId);
      await useKanbanStore.getState().loadAll();
      useKanbanStore.getState().scheduleSync();
    } catch(e){Alert.alert('Aufgabe aus Notiz',e instanceof Error?e.message:'Aktion fehlgeschlagen.');}
    finally {creatingTask.current=false;}
  }
  function perform(fn:()=>Promise<void>) {
    if(busy)return;
    setBusy(true); void fn().catch(e=>Alert.alert('Notiz',e instanceof Error?e.message:'Aktion fehlgeschlagen.')).finally(()=>setBusy(false));
  }
  const close=()=>router.replace({pathname:'/',params:{tab:'notes'}});
  const button=(label:string,action:()=>void)=> <TouchableOpacity key={label} disabled={busy} accessibilityRole="button" onPress={action} style={{padding:10,borderRadius:10,backgroundColor:theme.pillBg}}><Text style={{color:theme.accent,fontWeight:'600'}}>{label}</Text></TouchableOpacity>;
  const field={color:theme.text,padding:12,backgroundColor:theme.inputBg,borderRadius:12};
  const row={flexDirection:'row' as const,flexWrap:'wrap' as const,gap:6};
  const [textView,setTextView]=useState(false);
  const shopping=/(?:^|[\s,])#Einkaufsliste(?:$|[\s,])/i.test(note?.tags ?? '');
  const editable=note?.state!=='trash';
  return <KeyboardAvoidingView style={{flex:1,backgroundColor:theme.background}} behavior={Platform.OS==='ios'?'padding':undefined}><Stack.Screen options={{headerShown:true,headerTitle:shopping?'Einkaufsliste':'Notiz',headerBackTitle:'Zurück',headerRight:()=>button(menu?'Schließen':'•••',()=>setMenu(!menu))}}/>
    <View style={{flex:1}} onLayout={e=>setHeight(Math.max(140,e.nativeEvent.layout.height-155))}>
    {!note?<Text style={{padding:20,color:theme.text}}>{status}</Text>:<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12,paddingBottom:50}}>
      <TextInput editable={editable} accessibilityLabel="Titel" placeholder="Ohne Titel" placeholderTextColor={theme.subtext} style={{...field,fontSize:24,fontWeight:'700'}} value={note.title} maxLength={500} onChangeText={title=>void update({title})}/>
      {menu && <View style={row}>{shopping && editable && button(textView?'Bildansicht':'Textansicht',()=>{setTextView(!textView);setMenu(false);})}{editable && button(note.pinned?'Lösen':'Anheften',()=>void update({pinned:note.pinned?0:1}))}
        {editable && button('Als Vorlage speichern',()=>perform(async()=>{
          if (!draft.current) return;
          await saveTemplate(draft.current);
          Alert.alert('Vorlage gespeichert','Unter Notizen → Aus Vorlage kannst du sie verwenden.');
        }))}
        {button('.md exportieren',()=>perform(async()=>{
          const dir=new Directory(Paths.cache,'NoteExports',id);
          dir.create({intermediates:true,idempotent:true});
          const safe=(note.title||'Notiz').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80)||'Notiz';
          const file=new File(dir,safe+'.md');
          try { file.write('# '+(note.title||'Notiz')+'\n\n'+note.body+'\n\n'+note.tags); await Sharing.shareAsync(file.uri,{mimeType:'text/markdown'}); }
          finally { if(file.exists)file.delete(); }
        }))}
        {button('Teilen',()=>perform(async()=>{await Share.share({message:[note.title,note.body,note.tags].filter(Boolean).join('\n\n')});}))}</View>}
      {!menu && files.length>0 && button(files.length + (files.length===1?' Anhang anzeigen':' Anhänge anzeigen'),()=>setMenu(true))}
      {editable ? <>
        {shopping && !textView ? <ShoppingList body={note.body} change={edit=>{
          if(!draft.current)return;
          const body=edit(draft.current.body);
          if(body!==draft.current.body)void update({body});
        }}/> : <RichNoteEditor onTask={selection=>void fromSelection(selection)} height={height} key={id+'-'+editorKey} value={note.body} onChange={body=>void update({body})}/>}
        {createdTask && button('Aufgabe erstellt · Öffnen',()=>router.push({pathname:'/task',params:{id:createdTask}}))}
        <View style={row}>
          {undo.current.length>0 && button('Zurücknehmen',()=>{redo.current.push(note.body);void update({body:undo.current.pop()!},false);})}
          {redo.current.length>0 && button('Wiederholen',()=>{undo.current.push(note.body);void update({body:redo.current.pop()!},false);})}</View>
      </>:<View style={{padding:14,backgroundColor:theme.cardBg,borderRadius:12}}>{note.body.split('\n').map((line,i)=>{
        const check=/^- \[([ xX])\] /.exec(line);
        if(check)return <Text key={i} accessibilityRole="checkbox" accessibilityState={{checked:check[1]!==' '}} onPress={()=>{if(editable){const lines=note.body.split('\n');lines[i]=(check[1]===' '?'- [x] ':'- [ ] ')+line.slice(6);void update({body:lines.join('\n')});}}} style={{color:theme.text,paddingVertical:6}}>{check[1]===' '?'☐':'☑'} {line.slice(6)}</Text>;
        const heading=/^#{1,3} /.test(line);
        return <Text key={i} style={{color:theme.text,fontSize:heading?21:16,fontWeight:heading?'700':'400',lineHeight:25}}>{line.replace(/^#{1,3} /,'').replace(/^- /,'• ').split(/(\*\*.+?\*\*)/g).map((part,j)=>part.startsWith('**')&&part.endsWith('**')?<Text key={j} style={{fontWeight:'700'}}>{part.slice(2,-2)}</Text>:part)}</Text>;
      })}</View>}
      {(menu || !editable) && <>{editable && <ProjectAssignment kind="note" item={id}/>}<TextInput accessibilityLabel="Ordner" editable={editable} style={field} placeholder="Ordner" placeholderTextColor={theme.subtext} value={note.folder} maxLength={100} onChangeText={folder=>void update({folder})}/>
      <TextInput accessibilityLabel="Tags" editable={editable} style={field} placeholder="Tags, z. B. #Idee #Privat" placeholderTextColor={theme.subtext} value={note.tags} maxLength={500} onChangeText={tags=>void update({tags})}/>
      {files.map(a=><View key={a.id} style={{padding:12,backgroundColor:theme.cardBg,borderRadius:12,gap:8}}>
        {a.mime.startsWith('image/') && <Image resizeMode="contain" source={{uri:attachmentFile(a).uri}} style={{height:160,width:'100%'}}/>}<Text style={{color:theme.text}}>{a.name}</Text>
        <View style={row}>{button('Öffnen / Teilen',()=>perform(async()=>{await Sharing.shareAsync(attachmentFile(a).uri,{mimeType:a.mime});}))}
        {editable && button('Anhang entfernen',()=>Alert.alert('Anhang entfernen?',a.name,[{text:'Abbrechen'},{text:'Entfernen',style:'destructive',onPress:()=>perform(async()=>{await removeAttachment(a);setFiles(await noteFiles(id));})}]))}</View></View>)}
      <View style={row}>{editable && button('＋ Anhang',()=>perform(async()=>{
        const picked=await Picker.getDocumentAsync({multiple:true,copyToCacheDirectory:true});
        if(!picked.canceled){await attachFiles(note,picked.assets.map(a=>({uri:a.uri,name:a.name,mime:a.mimeType??'application/octet-stream'})));setFiles(await noteFiles(id));}
      }))}
      {button(note.state==='active'?'Archivieren':'Wiederherstellen',()=>perform(async()=>{await update({state:note.state==='active'?'archived':'active'});close();}))}
      {editable?button('In Papierkorb',()=>perform(async()=>{await update({state:'trash'});close();})):button('Endgültig löschen',()=>Alert.alert('Notiz und Anhänge endgültig löschen?',note.title,[{text:'Abbrechen'},{text:'Löschen',style:'destructive',onPress:()=>perform(async()=>{await writes.current;await purgeNote(id);close();})}]))}</View>
      {editable && button(versions?'Verlauf schließen':'Versionsverlauf',()=>perform(async()=>{await writes.current;setVersions(versions?null:await noteVersions(id));}))}
      {versions && <View style={{gap:8}}>{!versions.length && <Text style={{color:theme.subtext}}>Noch keine frühere Version gespeichert.</Text>}{versions.map(v=><TouchableOpacity key={v.id} style={field} onPress={()=>Alert.alert('Diese Version wiederherstellen?',v.title,[{text:'Abbrechen'},{text:'Wiederherstellen',onPress:()=>{void update({title:v.title,body:v.body});resetEditor(n=>n+1);setVersions(null);}}])}><Text style={{color:theme.text}}>{new Date(v.savedAt).toLocaleString('de-DE')} · {v.title}</Text><Text numberOfLines={2} style={{color:theme.subtext}}>{v.body}</Text></TouchableOpacity>)}</View>}
      </>}{busy && <ActivityIndicator/>}<Text accessibilityLiveRegion="polite" onPress={()=>{if(status.includes('fehlgeschlagen'))void update({});}} style={{color:theme.subtext}}>{status}</Text>
    </ScrollView>}</View>
  </KeyboardAvoidingView>;
}
