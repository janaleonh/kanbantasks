import { useHorizontalPaging } from '../hooks/useHorizontalPaging';
import { useRememberedDay } from '../calendar/useRememberedDay';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayKey, localDate } from '../calendar/dates';
import { cycleDay, cycleStats, nextPeriod } from '../calendar/cycle';
import { useCalendarStore } from '../stores/useCalendarStore';
import { useTheme } from '../hooks/useTheme';
import { CycleEditor, recordRange, useCycle } from './CycleCalendar';

import { Symptoms } from './PrivateJournal';

const dots = { period: '#D9577D', fertile: '#29918A', ovulation: '#8E6DB8' };
function marker(label: string | null) {
  if (label?.startsWith('Periodenbeginn') || label?.startsWith('Periode ·')) return dots.period;
  if (label?.startsWith('Eisprung')) return dots.ovulation;
  if (label?.startsWith('Fruchtbare')) return dots.fertile;
  return 'transparent';
}
const dayNumber = (key: string) => Date.parse(key + 'T00:00:00Z') / 86400000;

export function PeriodTab() {
  const theme = useTheme(), insets = useSafeAreaInsets();
  const { cycle, loaded } = useCycle();
  const today = useCalendarStore(s => s.todayKey);
  const [selected, setChoice] = useRememberedDay('cycle', today);
  const [range,setRange]=useState<{start?:string;end?:string}|null>(null);
  const [saving,setSaving]=useState(false);
  const pick=(key:string)=>{
    if(!range){setChoice(key);return;}
    if(key>today || saving)return;
    if(!range.start || range.end)setRange({start:key});
    else setRange({start:key<range.start?key:range.start,end:key<range.start?range.start:key});
    setChoice(key);
  };
  const date = localDate(selected);
  const year = date.getFullYear(), month = date.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const stats = cycle && cycleStats(cycle, today);
  const next = cycle && nextPeriod(cycle, today);
  const remaining = next ? dayNumber(next) - dayNumber(today) : null;
  const status = cycleDay(cycle, selected);
  const start = cycle?.starts.filter(key => key <= selected).sort().pop();
  const cycleIndex = cycle && start ? (dayNumber(selected) - dayNumber(start)) % cycleStats(cycle, selected).length + 1 : null;
  const shift = (delta: number) => setChoice(dayKey(new Date(year, month + delta, 1)));
  const paging = useHorizontalPaging(shift);
  const ink = theme.isDark ? '#FFEAF2' : '#582640';
  const card = { backgroundColor: theme.cardBg, borderColor: theme.border };

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
    <LinearGradient colors={theme.isDark ? ['#452337', '#33253F'] : ['#FCE2E8', '#EFE5F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ color: ink, fontWeight: '600' }}>{localDate(today).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        <Text accessibilityRole="header" style={[styles.headline, { color: ink }]}>{remaining === null ? 'Dein Zyklus' : remaining === 0 ? 'Periode heute erwartet' : 'Periode in ' + remaining + (remaining === 1 ? ' Tag' : ' Tagen')}</Text>
        {next && <Text style={{ color: ink }}>Voraussichtlich am {localDate(next).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}</Text>}
      </View>
      <View accessible={false} style={[styles.emblem, { borderColor: theme.isDark ? '#865F78' : '#E7BED4' }]}><Ionicons name="water-outline" size={32} color={ink} /></View>
    </LinearGradient>
    {!range && <CycleEditor selected={selected} onRecorded={setChoice} />}
    {stats && cycle && <View style={[styles.card, card, {gap: 8}]}>
      <Text accessibilityRole="header" style={[styles.title,{color:theme.text}]}>Dein Zyklusverlauf</Text>
      <Text style={{color:theme.text}}>Prognose mit {stats.length} Tagen · {cycle.automatic === false ? 'manuell eingestellt' : stats.typical === null ? 'Startwert' : 'aus deinem Verlauf'}</Text>
      {!!stats.intervals.length && <Text style={{color:theme.text}}>Letzte Zykluslängen: {stats.intervals.join(' · ')} Tage</Text>}
      <Text style={{color:theme.subtext}}>{stats.typical === null ? 'Für die automatische Länge werden zwei auswertbare Abstände zwischen Periodenbeginnen benötigt.' : 'Median aus ' + stats.usable.length + ' Abständen: ' + stats.typical + ' Tage. Spanne: ' + Math.min(...stats.usable) + '–' + Math.max(...stats.usable) + ' Tage.'}</Text>
      {stats.intervals.length !== stats.usable.length && <Text style={{color:theme.subtext}}>Abstände außerhalb von 16–90 Tagen sind im Verlauf sichtbar und werden bei der Berechnung ausgelassen.</Text>}
      {!!stats.trend && <Text style={{color:theme.text}}>{stats.trend}</Text>}
    </View>}
    <View style={[styles.card, card]}>
      <View {...paging} style={styles.row}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Vorheriger Monat" onPress={() => shift(-1)} style={styles.arrow}><Ionicons name="chevron-back" color={theme.text} size={20} /></TouchableOpacity>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Nächster Monat" onPress={() => shift(1)} style={styles.arrow}><Ionicons name="chevron-forward" color={theme.text} size={20} /></TouchableOpacity>
      </View>
      <TouchableOpacity disabled={!loaded||saving} onPress={()=>setRange(range?null:{})} style={{padding:10}}><Text style={{color:theme.accent}}>{range?'Auswahl abbrechen':'Periode im Kalender eintragen'}</Text></TouchableOpacity>
      {range && <Text accessibilityLiveRegion="polite" style={{color:theme.text}}>{!range.start?'Ersten Blutungstag antippen':!range.end?'Letzten Blutungstag antippen':localDate(range.start).toLocaleDateString('de-DE')+' – '+localDate(range.end).toLocaleDateString('de-DE')}</Text>}
      {range?.end && <TouchableOpacity disabled={saving} onPress={async()=>{setSaving(true);try{await recordRange(range.start!,range.end!,today);setRange(null);}catch(e){Alert.alert('Zeitraum prüfen',(e as Error).message);}finally{setSaving(false);}}} style={{padding:12}}><Text style={{color:theme.accent}}>Zeitraum speichern</Text></TouchableOpacity>}
      <View {...paging} style={styles.grid}>{['Mo','Di','Mi','Do','Fr','Sa','So'].map(label => <Text key={label} style={[styles.weekday,{color:theme.subtext}]}>{label}</Text>)}
        {Array.from({length: offset}, (_, index) => <View key={'space'+index} style={styles.cell} />)}
        {Array.from({length: count}, (_, index) => {
          const key = dayKey(new Date(year, month, index + 1));
          const label = cycleDay(cycle, key), selectedCell = key === selected;
          return <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{selected:selectedCell}} accessibilityLabel={[localDate(key).toLocaleDateString('de-DE'), key === today && 'Heute', label].filter(Boolean).join(', ')} disabled={!!range && (saving || key>today)} onPress={() => pick(key)} style={[styles.cell, range?.start && key>=range.start && key<=(range.end??range.start) ? {backgroundColor:theme.pillBg} : undefined]}>
            <View style={[styles.date, { backgroundColor: selectedCell ? ink : 'transparent', borderColor: key === today ? ink : 'transparent' }]}>
              <Text style={{color:selectedCell ? (theme.isDark ? '#392234' : 'white') : theme.text, fontWeight:selectedCell ? '700' : '500'}}>{index + 1}</Text>
            </View>
            <View style={[styles.dot,{borderWidth:1.5,borderColor:marker(label),backgroundColor:label?.includes('eingetragen') ? marker(label) : 'transparent'}]} />
          </TouchableOpacity>;
        })}
      </View>
      <Text style={{color:theme.subtext,fontSize:12}}>● Eingetragen · ○ Geschätzt</Text>
      <View style={styles.legend}>{Object.entries({ Periode: dots.period, 'Fruchtbare Tage': dots.fertile, Eisprung: dots.ovulation }).map(([label,color]) => <View key={label} style={styles.key}><View style={[styles.dot,{backgroundColor:color}]} /><Text style={{color:theme.subtext,fontSize:12}}>{label}</Text></View>)}</View>
    </View>
    <View style={[styles.card,card]}>
      <View style={styles.row}><Text style={[styles.title,{color:theme.text}]}>{date.toLocaleDateString('de-DE',{day:'numeric',month:'long'})}</Text><TouchableOpacity accessibilityRole="button" onPress={()=>setChoice(null)} style={{padding:10}}><Text style={{color:theme.accent}}>Heute</Text></TouchableOpacity></View>
      {loaded && <Text style={{color:theme.subtext, paddingBottom:6}}>{[cycleIndex && 'Zyklustag ' + cycleIndex, status].filter(Boolean).join(' · ') || 'Für diesen Tag liegt kein Zykluseintrag vor.'}</Text>}
      {!range && selected<=today && <Symptoms key={selected} day={selected}/>}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  hero:{borderRadius:26,padding:22,flexDirection:'row',alignItems:'center',gap:12},
  headline:{fontSize:29,lineHeight:34,fontWeight:'700',letterSpacing:-0.8},
  emblem:{width:62,height:62,borderRadius:31,borderWidth:3,alignItems:'center',justifyContent:'center'},
  card:{padding:14,borderRadius:20,borderWidth:1},
  title:{fontSize:18,fontWeight:'700'},
  row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  arrow:{width:40,height:44,alignItems:'center',justifyContent:'center'},
  grid:{flexDirection:'row',flexWrap:'wrap'},
  weekday:{width:'14.2857%',textAlign:'center',fontSize:12,paddingVertical:8},
  cell:{width:'14.2857%',minHeight:45,alignItems:'center',justifyContent:'center'},
  date:{width:31,height:31,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center'},
  dot:{width:6,height:6,borderRadius:3},
  legend:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:12},
  key:{flexDirection:'row',alignItems:'center',gap:5},
});
