import React, { useCallback, useState } from 'react';
import { Alert, Button, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { getDatabase } from '../src/db/database';
import { attachmentFile, listNotes, type Attachment, type Note } from '../src/notes/library';
import { NasFolderPicker } from '../src/components/NasFolderPicker';
import { useDocumentStore } from '../src/stores/useDocumentStore';
import { useTheme } from '../src/hooks/useTheme';

export default function Inbox() {
  const theme=useTheme(),router=useRouter();
  const [files,setFiles]=useState<Attachment[]>([]),[notes,setNotes]=useState<Note[]>([]);
  const [assign,setAssign]=useState(''),[target,setTarget]=useState<{file:Attachment; config:string}|null>(null);
  const {config,home,uploadFile,uploading}=useDocumentStore();
  const load=useCallback(async()=>{
    const db=await getDatabase();
    setFiles(await db.getAllAsync<Attachment>('SELECT id,name,mime FROM inbox_files ORDER BY rowid DESC'));
    setNotes((await listNotes()).filter(n=>n.state==='active'));
  },[]);
  const fail=(e:unknown)=>Alert.alert('Dokumenteneingang',e instanceof Error?e.message:'Aktion fehlgeschlagen.');
  useFocusEffect(useCallback(()=>{void load().catch(fail);},[load]));
  async function toNote(id:string,noteId:string){
    const db=await getDatabase();
    await db.withExclusiveTransactionAsync(async tx=>{
      const inserted=await tx.runAsync('INSERT INTO note_files SELECT id,?,name,mime FROM inbox_files WHERE id=?',[noteId,id]);
      if(!inserted.changes)throw new Error('Die Datei wurde bereits zugeordnet.');
      await tx.runAsync('DELETE FROM inbox_files WHERE id=?',[id]);
    });
    setAssign('');await load();router.push({pathname:'/note',params:{id:noteId}});
  }
  return <ScrollView style={{backgroundColor:theme.background}} contentContainerStyle={{padding:16,gap:12}}>
    <Stack.Screen options={{headerShown:true,headerTitle:'Dokumenteneingang'}}/>
    {!files.length && <Text style={{color:theme.subtext}}>Hier landen Dateien, für die du beim Teilen „Dokumenteneingang“ auswählst.</Text>}
    {files.map(file=><View key={file.id} style={{padding:14,backgroundColor:theme.cardBg,borderRadius:theme.cardRadius}}>
      <Text style={{color:theme.text,fontWeight:'600'}}>{file.name}</Text>
      <Button title="Öffnen / Teilen" onPress={()=>void Sharing.shareAsync(attachmentFile(file).uri,{mimeType:file.mime}).catch(fail)}/>
      <Button title="Auf NAS ablegen" disabled={!config||!home||uploading} onPress={()=>config && setTarget({file,config:config.id})}/>
      <Button title="Einer Notiz hinzufügen" onPress={()=>setAssign(assign===file.id?'':file.id)}/>
      {assign===file.id && <>{!notes.length && <Text style={{color:theme.subtext}}>Lege zuerst eine Notiz im Notizbereich an.</Text>}{notes.map(n=><Button key={n.id} title={n.title||'Ohne Titel'} onPress={()=>void toNote(file.id,n.id).catch(fail)}/>)}</>}
    </View>)}
    <NasFolderPicker visible={!!target} onClose={()=>setTarget(null)} onSelect={folder=>{
      if(!target)return;
      const f=attachmentFile(target.file);
      void uploadFile(folder,{body:f,size:f.size,name:target.file.name},target.config).then(()=>Alert.alert('Auf dem NAS gespeichert',target.file.name)).catch(fail);
    }}/>
  </ScrollView>;
}
