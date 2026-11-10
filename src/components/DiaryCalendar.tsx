import { useHorizontalPaging } from '../hooks/useHorizontalPaging';
import React, { useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { dayKey, localDate } from '../calendar/dates';
import { dayItems, readDiary } from '../db/journal';
import { useTheme } from '../hooks/useTheme';
import { diaryPhoto } from './DiaryAttachments';
import { DiaryEditor } from './PrivateJournal';

type Props = { day:string; today:string; entries:string[]; select:(day:string)=>void; refresh:()=>void };
const dateLabel=(key:string)=>localDate(key).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});

export function DiaryCalendar({day,today,entries,select,refresh}:Props) {
  const t=useTheme();
  const [mode,setMode]=useState<'Monat'|'Verlauf'>('Monat');
  const [editing,setEditing]=useState(false);
  const [photo,setPhoto]=useState('');
  const month=day.slice(0,7);
  const first=localDate(month+'-01');
  const year=first.getFullYear(), m=first.getMonth();
  const length=new Date(year,m+1,0).getDate();
  const offset=(first.getDay()+6)%7;
  const records=useMemo(()=>new Map(entries.filter(key=>key.startsWith(month+'-')).sort().map(key=>[
    key,{body:readDiary(key),items:dayItems(key)}
  ])),[month,entries]);
  function button(label:string,action:()=>void) {
    return <Pressable accessibilityRole="button" onPress={action} style={{minHeight:44,paddingHorizontal:10,justifyContent:'center'}}>
      <Text style={{color:t.accent,fontWeight:'600'}}>{label}</Text></Pressable>;
  }
  function edit(key:string){select(key);setEditing(true);}
  function card(key:string) {
    const record=records.get(key);
    const photos=record?.items.filter(i=>i.kind==='photo')??[];
    return <View key={key} style={{backgroundColor:t.cardBg,padding:14,gap:10,borderRadius:16}}>
      <Text accessibilityRole="header" style={{color:t.text,fontWeight:'700',fontSize:19}}>{dateLabel(key)}</Text>
      {photos.length>0 && <ScrollView horizontal contentContainerStyle={{gap:8}}>{photos.map((item,index)=>{
        const uri=diaryPhoto(item).uri;
        return <Pressable key={item.id} accessibilityRole="imagebutton" accessibilityLabel={'Foto '+(index+1)+' vergrößern'} onPress={()=>setPhoto(uri)}>
          <Image source={{uri}} style={{width:250,height:190,borderRadius:12}}/></Pressable>;
      })}</ScrollView>}
      {!!record?.body && <Text selectable style={{color:t.text,fontSize:16,lineHeight:24}}>{record.body}</Text>}
      {record?.items.filter(i=>i.kind!=='photo').map(item=><Text key={item.id} selectable style={{color:t.subtext}}>{item.kind==='place'?'Ort · ':'Link · '}{item.value}</Text>)}
      {button(record?'Eintrag bearbeiten':'Eintrag schreiben',()=>edit(key))}
    </View>;
  }
  const shift = (offset:number)=>select(dayKey(new Date(year,m+offset,1)));
  const paging = useHorizontalPaging(shift);
  if(editing)return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12,paddingBottom:50}}>
      {button('Fertig',()=>{refresh();setEditing(false);})}
      <Text style={{color:t.text,fontSize:21,fontWeight:'700'}}>{dateLabel(day)}</Text>
      <DiaryEditor key={day} day={day} refresh={refresh}/>
    </ScrollView></KeyboardAvoidingView>;
  return <ScrollView contentContainerStyle={{padding:12,gap:12,paddingBottom:50}}>
    <View accessibilityRole="tablist" style={{flexDirection:'row',backgroundColor:t.pillBg,borderRadius:12,padding:4}}>
      {(['Monat','Verlauf'] as const).map(label=><Pressable key={label} accessibilityRole="tab" accessibilityState={{selected:mode===label}}
        onPress={()=>setMode(label)} style={{flex:1,alignItems:'center',padding:12,borderRadius:10,backgroundColor:mode===label?t.surface:'transparent'}}>
        <Text style={{color:t.text,fontWeight:'600'}}>{label}</Text></Pressable>)}
    </View>
    <View {...paging} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
      {button('‹',()=>select(dayKey(new Date(year,m-1,1))))}
      <Text accessibilityRole="header" style={{color:t.text,fontSize:20,fontWeight:'700'}}>{first.toLocaleDateString('de-DE',{month:'long',year:'numeric'})}</Text>
      {button('›',()=>select(dayKey(new Date(year,m+1,1))))}
    </View>
    {mode==='Monat' && <View {...paging} style={{flexDirection:'row',flexWrap:'wrap'}}>
      {['Mo','Di','Mi','Do','Fr','Sa','So'].map(label=><Text key={label} style={{width:'14.2857%',textAlign:'center',color:t.subtext,paddingVertical:6}}>{label}</Text>)}
      {Array.from({length:offset},(_,i)=><View key={'empty'+i} style={{width:'14.2857%'}}/>)}
      {Array.from({length},(_,i)=>{
        const key=dayKey(new Date(year,m,i+1)), record=records.get(key);
        const cover=record?.items.find(item=>item.kind==='photo');
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{selected:key===day,disabled:key>today}}
          accessibilityLabel={dateLabel(key)+(record?', mit Eintrag':'')} disabled={key>today} onPress={()=>select(key)} style={{width:'14.2857%',padding:1}}>
          <View style={{minHeight:74,backgroundColor:t.cardBg,borderColor:key===day?t.accent:t.border,borderWidth:key===day?2:1,borderRadius:7,overflow:'hidden',padding:2}}>
            <Text style={{color:key===today?t.accent:t.text,opacity:key>today?0.45:1,fontWeight:'600'}}>{i+1}</Text>
            {cover?<Image source={{uri:diaryPhoto(cover).uri}} style={{width:'100%',height:42,borderRadius:4}}/>:
              record && <Text numberOfLines={2} style={{color:t.subtext,fontSize:11}}>{record.body||record.items[0]?.value}</Text>}
          </View></Pressable>;
      })}
    </View>}
    {button('Heute',()=>select(today))}
    {mode==='Monat' ? day<=today && card(day) : records.size ? Array.from(records.keys(),card) :
      <Text style={{color:t.subtext}}>Für diesen Monat gibt es noch keine Einträge.</Text>}
    <Modal visible={!!photo} transparent onRequestClose={()=>setPhoto('')}>
      <Pressable accessibilityRole="button" accessibilityLabel="Foto schließen" onPress={()=>setPhoto('')} style={{flex:1,backgroundColor:'#101010',justifyContent:'center'}}>
        {!!photo && <Image source={{uri:photo}} resizeMode="contain" style={{width:'100%',height:'80%'}}/>}
        <Text style={{color:'white',textAlign:'center',padding:14}}>Schließen</Text>
      </Pressable></Modal>
  </ScrollView>;
}
