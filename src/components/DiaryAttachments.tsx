import React, { useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Picker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { addDayItem, deleteDayItem, type DiaryItem } from '../db/journal';
import { generateUUID } from '../utils/uuid';
import { useTheme } from '../hooks/useTheme';

const directory=()=>new Directory(Paths.document,'DiaryPhotos');
export const diaryPhoto=(item:DiaryItem)=>new File(directory(),item.value);
export function discardPhotos(items:DiaryItem[]) {
  for(const item of items.filter(i=>i.kind==='photo')){
    const file=diaryPhoto(item);
    if(file.exists)file.delete();
  }
}
export function DiaryAttachments({day,items,refresh}:{day:string;items:DiaryItem[];refresh:()=>void}) {
  const t=useTheme();
  const [form,setForm]=useState<'place'|'link'|null>(null);
  const [value,setValue]=useState('');
  const [preview,setPreview]=useState('');
  const [busy,setBusy]=useState(false);
  const button=(label:string,action:()=>void)=><Pressable accessibilityRole="button" onPress={action} style={{padding:10,minHeight:44,justifyContent:'center'}}><Text style={{color:t.accent,fontWeight:'600'}}>{label}</Text></Pressable>;
  async function photos(camera=false){
    if(busy)return;
    setBusy(true);
    try {
      if(camera && !(await Picker.requestCameraPermissionsAsync()).granted){
        Alert.alert('Kamerazugriff fehlt','Du kannst den Zugriff in den iPhone-Einstellungen erlauben.');return;
      }
      const result=camera ? await Picker.launchCameraAsync({mediaTypes:['images'],quality:0.9}) : await Picker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,quality:0.9});
      if(result.canceled)return;
      directory().create({intermediates:true,idempotent:true});
      for(const asset of result.assets){
        const id=generateUUID();
        const extension=(asset.fileName??asset.uri).match(/\.([a-z0-9]{1,5})$/i)?.[1]??'jpg';
        const item:DiaryItem={id,kind:'photo',value:id+'.'+extension};
        const file=diaryPhoto(item);
        try {new File(asset.uri).copy(file);addDayItem(day,item);}
        catch(error){if(file.exists)file.delete();throw error;}
      }
    }catch{Alert.alert('Foto konnte nicht hinzugefügt werden.');}
    finally{refresh();setBusy(false);}
  }
  function add(){
    if(!form||!value.trim())return;
    let clean=value.trim();
    if(form==='link'){
      try {const url=new URL(clean.includes(':')?clean:'https://'+clean);
        if(!['http:','https:'].includes(url.protocol)||!url.hostname)throw Error();
        clean=url.href;
      }catch{Alert.alert('Bitte gib eine Webadresse mit http oder https ein.');return;}
    }
    try{addDayItem(day,{id:generateUUID(),kind:form,value:clean});refresh();setValue('');setForm(null);}
    catch{Alert.alert('Speichern fehlgeschlagen.');}
  }
  function remove(item:DiaryItem){
    Alert.alert('Aus dem Tagebuch entfernen?',item.kind==='photo'?'Dieses Foto':item.value,[{text:'Abbrechen',style:'cancel'},
      {text:'Entfernen',style:'destructive',onPress:()=>{try{deleteDayItem(day,item.id);refresh();discardPhotos([item]);}catch{Alert.alert('Entfernen fehlgeschlagen.');}}}]);
  }
  const photosOnly=items.filter(i=>i.kind==='photo');
  return <View style={{gap:8}}>
    <View style={{flexDirection:'row',flexWrap:'wrap'}}>{button(busy?'Lädt …':'＋ Fotos',()=>void photos())}
      {button('Kamera',()=>void photos(true))}{button('＋ Ort',()=>{setValue('');setForm('place');})}{button('＋ Link',()=>{setValue('');setForm('link');})}</View>
    {form && <View><TextInput autoFocus accessibilityLabel={form==='place'?'Ortsname oder Adresse':'Webadresse'} placeholder={form==='place'?'Ortsname oder Adresse':'https://…'} placeholderTextColor={t.subtext}
      autoCapitalize={form==='link'?'none':'sentences'} keyboardType={form==='link'?'url':'default'} value={value} onChangeText={setValue} onSubmitEditing={add}
      style={{padding:12,borderRadius:10,backgroundColor:t.inputBg,color:t.text}}/>
      <View style={{flexDirection:'row'}}>{button('Speichern',add)}{button('Abbrechen',()=>setForm(null))}</View></View>}
    {photosOnly.length>0 && <ScrollView horizontal contentContainerStyle={{gap:10}}>{photosOnly.map((item,index)=><View key={item.id}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Foto '+(index+1)+' öffnen'} onPress={()=>setPreview(diaryPhoto(item).uri)}>
        <Image source={{uri:diaryPhoto(item).uri}} style={{width:130,height:110,borderRadius:12}}/></Pressable>
      {button('Entfernen',()=>remove(item))}</View>)}</ScrollView>}
    {items.filter(i=>i.kind!=='photo').map(item=><View key={item.id} style={{flexDirection:'row',alignItems:'center',gap:6}}>
      <Pressable style={{flex:1,paddingVertical:10}} accessibilityRole="link" onPress={()=>void Linking.openURL(item.kind==='place'?'https://maps.apple.com/?q='+encodeURIComponent(item.value):item.value).catch(()=>Alert.alert('Öffnen fehlgeschlagen.'))}>
        <Text style={{color:t.accent}}>{item.kind==='place'?'Ort · ':''}{item.value}</Text></Pressable>{button('Entfernen',()=>remove(item))}</View>)}
    <Modal visible={!!preview} transparent onRequestClose={()=>setPreview('')}><View style={{flex:1,backgroundColor:'#141414',paddingVertical:56}}>
      {!!preview && <Image source={{uri:preview}} resizeMode="contain" style={{flex:1}}/>}
      <Pressable accessibilityRole="button" onPress={()=>setPreview('')} style={{padding:16,alignItems:'center'}}><Text style={{color:'white'}}>Schließen</Text></Pressable>
    </View></Modal>
  </View>;
}
