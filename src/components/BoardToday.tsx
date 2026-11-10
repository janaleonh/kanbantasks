import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { dayKey, eventsForDay, eventTimeLabel, localDate } from '../calendar/dates';
import { useCalendarStore } from '../stores/useCalendarStore';
import { useTheme } from '../hooks/useTheme';
import type { Task } from '../db/taskRepo';

export function BoardToday({tasks,onEdit}:{tasks:Task[];onEdit:(task:Task)=>void}) {
  const theme=useTheme(), router=useRouter();
  const {todayKey,eventsByMonth,selectedIds}=useCalendarStore();
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return ()=>clearInterval(timer);},[]);
  const events=eventsForDay(eventsByMonth[todayKey.slice(0,7)]??[],localDate(todayKey),selectedIds);
  const next=events.find(e=>!e.allDay && Date.parse(e.end)>now) ?? events.find(e=>e.allDay);
  const due=tasks.filter(task=>task.status!=='completed' && task.due && (task.due.length===10?task.due:dayKey(new Date(task.due)))===todayKey);
  if(!next && !due.length)return null;
  return <View style={{marginHorizontal:16,marginBottom:8,padding:12,gap:6,borderRadius:theme.cardRadius,backgroundColor:theme.surface}}>
    <Text accessibilityRole="header" style={{fontSize:18,fontWeight:'700',color:theme.text}}>Heute</Text>
    {next && <TouchableOpacity accessibilityRole="button" onPress={()=>router.push({pathname:'/event',params:{calendarId:next.calendarId,eventId:next.eventId}})}>
      <Text numberOfLines={2} style={{color:theme.accent,fontWeight:'600'}}>{eventTimeLabel(next)} · {next.title}</Text>
    </TouchableOpacity>}
    {due.length>0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
      {due.map(task=><TouchableOpacity key={task.id} accessibilityRole="button" onPress={()=>onEdit(task)} style={{maxWidth:240,padding:10,borderRadius:10,backgroundColor:theme.pillBg}}>
        <Text numberOfLines={1} style={{color:theme.text}}>{task.title}</Text>
      </TouchableOpacity>)}
    </ScrollView>}
  </View>;
}
