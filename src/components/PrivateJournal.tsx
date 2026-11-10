import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { DiaryAttachments, discardPhotos } from './DiaryAttachments';
import { dayItems, deleteDiary } from '../db/journal';
import { localDate } from '../calendar/dates';
import { readDiary, readSymptoms, removeSymptom, writeDiary, writeSymptom, type Symptom } from '../db/journal';
import { useTheme } from '../hooks/useTheme';

function Button({label,onPress,selected=false}:{label:string;onPress:()=>void;selected?:boolean}) {
  const t=useTheme();
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{selected}} onPress={onPress}
    style={{minHeight:44,justifyContent:'center',paddingHorizontal:12,borderRadius:12,backgroundColor:selected?t.accent:t.pillBg}}>
    <Text style={{color:selected?t.background:t.text,fontWeight:'600'}}>{label}</Text>
  </TouchableOpacity>;
}
const row={flexDirection:'row' as const,flexWrap:'wrap' as const,gap:6};
const format=(day:string)=>localDate(day).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

export function DiaryEditor({day,refresh}:{day:string;refresh:()=>void}) {
  const t=useTheme();
  const [items,setItems]=useState(()=>dayItems(day));
  const reload=()=>{setItems(dayItems(day));refresh();};
  const [body,setBody]=useState(()=>readDiary(day));
  const [failed,setFailed]=useState(false);
  function save(value:string) {
    setBody(value);
    try {writeDiary(day,value);setFailed(false);if(Boolean(value.trim())!==Boolean(body.trim()) || failed)refresh();}
    catch {setFailed(true);}
  }
  return <View style={{gap:8}}>
    <TextInput multiline accessibilityLabel="Tagebucheintrag" placeholder="Was beschäftigt dich heute?" placeholderTextColor={t.subtext}
      value={body} onChangeText={save} style={{padding:16,minHeight:200,textAlignVertical:'top',color:t.text,backgroundColor:t.cardBg,borderRadius:16,fontSize:17}}/>
    {failed && <Button label="Speichern fehlgeschlagen · Erneut versuchen" onPress={()=>save(body)}/>}
    <DiaryAttachments day={day} items={items} refresh={reload}/>
    {(!!body || items.length>0) && <Button label="Eintrag löschen" onPress={()=>Alert.alert('Tagebucheintrag löschen?',format(day),[
      {text:'Abbrechen',style:'cancel'},{text:'Löschen',style:'destructive',onPress:()=>{try{const old=dayItems(day);deleteDiary(day);setBody('');setFailed(false);reload();discardPhotos(old);}catch{Alert.alert('Löschen fehlgeschlagen.');}}}])}/>}
  </View>;
}

const choices=['Angstzustände','Krämpfe','Kopfschmerzen','Erschöpfung'];
export function Symptoms({day}:{day:string}) {
  const t=useTheme();
  const [items,setItems]=useState(()=>readSymptoms(day));
  const [selected,select]=useState('');
  const [custom,setCustom]=useState('');
  const item=items.find(entry=>entry.name===selected);
  function persist(entry:Symptom) {
    try {writeSymptom(day,entry);setItems(readSymptoms(day));select(entry.name);return true;}
    catch {Alert.alert('Beschwerde konnte nicht gespeichert werden.');return false;}
  }
  function choose(value:string) {
    const name=value.trim();
    if(!name)return;
    const existing=items.find(entry=>entry.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de'));
    if(existing){select(existing.name);setCustom('');}
    else if(persist({name,strength:'',note:''}))setCustom('');
  }
  const field={backgroundColor:t.inputBg,color:t.text,padding:12,borderRadius:12};
  return <View style={{gap:10,marginTop:12}}>
    <Text accessibilityRole="header" style={{fontSize:18,fontWeight:'700',color:t.text}}>Beschwerden</Text>
    <View style={row}>{Array.from(new Set([...choices,...items.map(entry=>entry.name)])).map(name=>
      <Button key={name} label={(items.some(entry=>entry.name===name)?'✓ ':'')+name} selected={selected===name} onPress={()=>choose(name)}/>)}</View>
    <View style={row}><TextInput style={[field,{flex:1}]} placeholder="Andere Beschwerde" accessibilityLabel="Andere Beschwerde"
      placeholderTextColor={t.subtext} maxLength={100} value={custom} onChangeText={setCustom} onSubmitEditing={()=>choose(custom)}/>
      <Button label="Eintragen" onPress={()=>choose(custom)}/></View>
    {item && <>
      <Text style={{color:t.text,fontWeight:'600'}}>{item.name} · Stärke (optional)</Text>
      <View style={row}>{['Leicht','Mittel','Stark'].map(strength=><Button key={strength} label={strength} selected={item.strength===strength}
        onPress={()=>persist({...item,strength:item.strength===strength?'':strength})}/>)}</View>
      <TextInput multiline style={field} value={item.note} accessibilityLabel="Notiz zur Beschwerde" placeholder="Kurze Notiz (optional)"
        placeholderTextColor={t.subtext} onChangeText={note=>persist({...item,note})}/>
      <Button label="Beschwerde entfernen" onPress={()=>Alert.alert('Beschwerde entfernen?',item.name,[
        {text:'Abbrechen',style:'cancel'},{text:'Entfernen',style:'destructive',onPress:()=>{
          try {removeSymptom(day,item.name);setItems(readSymptoms(day));select('');}catch{Alert.alert('Entfernen fehlgeschlagen.');}
        }}])}/>
    </>}
  </View>;
}
