import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { usePrivacyStore } from '../src/stores/usePrivacyStore';
import { getDatabase } from '../src/db/database';
import { deliveryHasFiles, receiveShare } from '../src/notes/incoming';
import { useTheme } from '../src/hooks/useTheme';
import { useKanbanStore } from '../src/stores/useKanbanStore';

export default function Receive() {
  const { delivery } = useLocalSearchParams<{delivery:string}>();
  return <ReceiveDelivery key={delivery} delivery={delivery}/>;
}
function ReceiveDelivery({delivery}:{delivery:string}){
  const theme=useTheme(), router=useRouter();
  const [choose,setChoose]=useState(false), [destination,setDestination]=useState<'note'|'inbox'|null>(null);
  const unlocked=usePrivacyStore(s => s.initialized && !s.locked);
  const [error,setError]=useState(''), [attempt,retry]=useState(0);
  useEffect(() => {
    if(!unlocked) return;
    let active=true;
    setError('');
    void (async () => {
      if (!destination && await deliveryHasFiles(delivery)) {if(active)setChoose(true);return;}
      const kind=await receiveShare(delivery,destination??'note');
      if (kind==='task') {
        await useKanbanStore.getState().loadAll();
        useKanbanStore.getState().scheduleSync();
      }
      if(!active)return;
      if(kind==='task'){
        const row=await (await getDatabase()).getFirstAsync<{taskId:string}>('SELECT taskId FROM capture_receipts WHERE id=?',['share:'+delivery]);
        if(active) router.replace({pathname:'/',params:{createdTask:row?.taskId??''}});
      } else router.replace(kind==='inbox'?'/inbox':{pathname:'/note',params:{id:delivery}});
    })().catch(e => { if (active) setError(e instanceof Error ? e.message : 'Übernahme fehlgeschlagen.'); });
    return () => { active=false; };
  },[delivery,attempt,router,unlocked,destination]);
  return <View style={{flex:1,padding:24,justifyContent:'center',backgroundColor:theme.background}}><Stack.Screen options={{headerShown:true,headerTitle:'In Planner übernehmen'}}/>
    {error ? <><Text style={{color:theme.text}}>{error}</Text><Button title="Erneut versuchen" onPress={()=>retry(n=>n+1)}/><Button title="Planner öffnen" onPress={()=>router.replace('/')}/></> : choose && !destination ? <><Text style={{color:theme.text}}>Wo möchtest du die geteilten Dateien ablegen?</Text><Button title="Dokumenteneingang" onPress={()=>setDestination('inbox')}/><Button title="Als Notiz speichern" onPress={()=>setDestination('note')}/></> : <ActivityIndicator color={theme.accent}/>}
  </View>;
}
