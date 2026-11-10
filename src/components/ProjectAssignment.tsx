import React,{useEffect,useState} from 'react';
import { Alert,Text,TextInput,TouchableOpacity,View } from 'react-native';
import { getDatabase } from '../db/database';
import { useTheme } from '../hooks/useTheme';

export type ProjectItem={kind:'note'|'document';owner:string;item:string;project:string};
export async function projectItems(owner:string){
  return (await getDatabase()).getAllAsync<ProjectItem>(`SELECT p.* FROM project_items p LEFT JOIN notes n ON p.kind='note' AND p.item=n.id
    WHERE (p.kind='note' AND n.state!='trash') OR (p.kind='document' AND p.owner=?)`,[owner]);
}
export function ProjectAssignment({kind,owner='',item}:{kind:ProjectItem['kind'];owner?:string;item:string}){
  const theme=useTheme(),[name,setName]=useState(''),[saved,setSaved]=useState(''),[ready,setReady]=useState(false);
  useEffect(()=>{let live=true;setReady(false);void getDatabase().then(db=>db.getFirstAsync<{project:string}>('SELECT project FROM project_items WHERE kind=? AND owner=? AND item=?',[kind,owner,item])).then(row=>{if(live){setName(row?.project??'');setSaved(row?.project??'');setReady(true);}}).catch(()=>Alert.alert('Projekt konnte nicht geladen werden.'));return ()=>{live=false;};},[kind,owner,item]);
  const save=async()=>{
    const db=await getDatabase(),value=name.trim();
    if(value)await db.runAsync('INSERT OR REPLACE INTO project_items VALUES (?,?,?,?)',[kind,owner,item,value]);
    else await db.runAsync('DELETE FROM project_items WHERE kind=? AND owner=? AND item=?',[kind,owner,item]);
    setSaved(value);setName(value);
  };
  return <View style={{flexDirection:'row',alignItems:'center',gap:8}}><TextInput editable={ready} accessibilityLabel="Projektname" placeholder="Projekt zuordnen" placeholderTextColor={theme.subtext} value={name} onChangeText={setName} maxLength={100} style={{flex:1,color:theme.text,backgroundColor:theme.inputBg,padding:10,borderRadius:10}}/>{name.trim()!==saved&&<TouchableOpacity onPress={()=>void save().catch(()=>Alert.alert('Projekt konnte nicht gespeichert werden.'))}><Text style={{color:theme.accent}}>Übernehmen</Text></TouchableOpacity>}</View>;
}
