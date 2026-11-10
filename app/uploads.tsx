import React,{useCallback,useState} from 'react';
import { Alert,ScrollView,Text,TouchableOpacity } from 'react-native';
import { Stack,useFocusEffect,useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { getScans,type ScanRecord } from '../src/documents/scans';
import { useScanRevision } from '../src/documents/scanOutbox';

export default function Uploads(){
  const theme=useTheme(),router=useRouter(),revision=useScanRevision(s=>s.revision);
  const [rows,setRows]=useState<ScanRecord[]>([]);
  useFocusEffect(useCallback(()=>{let live=true;void getScans().then(scans=>{if(live)setRows(scans.filter(s=>s.state));}).catch(()=>Alert.alert('Uploadliste konnte nicht geladen werden.'));return ()=>{live=false;};},[revision]));
  const labels:Record<string,string>={waiting:'Wartet auf Upload im Heim-WLAN',sending:'Wird hochgeladen',confirmed:'Auf dem NAS bestätigt',conflict:'Ziel prüfen'};
  return <ScrollView style={{backgroundColor:theme.background}} contentContainerStyle={{padding:16,gap:10}}><Stack.Screen options={{headerShown:true,headerTitle:'Scan-Uploads'}}/>
    {!rows.length && <Text style={{color:theme.subtext}}>Noch keine Scans für das NAS vorgemerkt.</Text>}
    {rows.map(s=><TouchableOpacity key={s.id} onPress={()=>router.push({pathname:'/scan',params:{id:s.id}})} style={{padding:14,backgroundColor:theme.cardBg,borderRadius:theme.cardRadius}}><Text style={{color:theme.text,fontWeight:'600'}}>{s.name}</Text><Text style={{color:theme.subtext}}>{labels[s.state!]||s.state} · {[s.folder,s.filename].filter(Boolean).join('/')}</Text>{!!s.error&&<Text style={{color:theme.text}}>{s.error}</Text>}</TouchableOpacity>)}
  </ScrollView>;
}
