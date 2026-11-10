import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { dayKey, localDate } from '../calendar/dates';
import { cycleDay, enterPeriod, type Cycle } from '../calendar/cycle';
import { useTheme } from '../hooks/useTheme';
import { useCalendarStore } from '../stores/useCalendarStore';

const key = 'planner.cycle.local';
const state = create<{ cycle: Cycle | null; loaded: boolean; failed: boolean }>(() => ({ cycle: null, loaded: false, failed: false }));
let loading: Promise<void> | undefined;
function loadCycle() {
  loading ??= SecureStore.getItemAsync(key).then(raw => {
    const cycle = raw === null ? null : JSON.parse(raw) as Cycle;
    if (cycle !== null && (!Array.isArray(cycle.starts) || !cycle.starts.every(date =>
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))) ||
      !Number.isInteger(cycle.length) || cycle.length < 16 || cycle.length > 90 ||
      !Number.isInteger(cycle.bleeding) || cycle.bleeding < 1 || cycle.bleeding >= cycle.length)) throw new Error();
    state.setState({ cycle, loaded: true, failed: false });
  }).catch(() => state.setState({ failed: true })).finally(() => { loading = undefined; });
  return loading;
}
export function useCycle() {
  const data = state();
  useEffect(() => {
    if (data.loaded) return;
    void loadCycle();
  }, [data.loaded]);
  return data;
}
export async function recordRange(start:string, end:string, today:string) {
  const {cycle,loaded}=state.getState();
  if(!loaded)throw new Error('Zyklusdaten werden noch geladen.');
  const value=enterPeriod(cycle ?? {starts:[],length:28,bleeding:5},start,end,today,cycle?.starts.includes(start)?start:null);
  await SecureStore.setItemAsync(key,JSON.stringify(value),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
  state.setState({cycle:value});
}
export function TodayCycle() {
  const today = useCalendarStore(s => s.todayKey);
  const { cycle } = useCycle();
  const theme = useTheme();
  const label = cycleDay(cycle, today);
  return label ? <Text style={{ color: theme.text, padding: 10 }}>{label}</Text> : null;
}
export function CycleEditor({ selected, onRecorded }: { selected: string; onRecorded: (date: string) => void }) {
  const { cycle, loaded, failed } = useCycle();
  const theme = useTheme();
  const today = useCalendarStore(s => s.todayKey);
  const [edit, setEdit] = useState(false);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState<string | null>(null);
  const [automatic, setAutomatic] = useState(true);
  const [history, setHistory] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [length, setLength] = useState('28'), [bleeding, setBleeding] = useState('5');
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [undo, setUndo] = useState<{ date: string; before: Cycle | null; after: Cycle } | null>(null);
  const previousDay = localDate(today);
  previousDay.setDate(previousDay.getDate() - 1);
  const yesterday = dayKey(previousDay);
  const latest = cycle?.starts.at(-1);
  function openEditor(original: string | null) {
    setEnd(original ? cycle?.ends?.[original] ?? null : null);
    setAutomatic(cycle?.automatic !== false);
    setReplacing(original);
    setStart(original ?? (selected <= today ? selected : today));
    setLength(String(cycle?.length ?? 28));
    setBleeding(String(cycle?.bleeding ?? 5));
    setEdit(true);
  }
  async function save(value: Cycle | null) {
    if (writing.current) return false;
    writing.current = true;
    setBusy(true);
    try {
      if (value) await SecureStore.setItemAsync(key, JSON.stringify(value), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      else await SecureStore.deleteItemAsync(key);
      state.setState({ cycle: value }); setEdit(false);
      setUndo(null);
      return true;
    } catch { Alert.alert('Zyklusdaten konnten nicht gespeichert werden.'); return false; }
    finally { writing.current = false; setBusy(false); }
  }
  async function record(date: string) {
    if (!loaded || date > dayKey(new Date()) || cycle?.starts.includes(date)) return;
    let after: Cycle;
    try { after = enterPeriod(cycle ?? { starts: [], length: 28, bleeding: 5 }, date, null, today); }
    catch (error) { Alert.alert('Periode prüfen', (error as Error).message); return; }
    if (await save(after)) {
      onRecorded(date);
      setUndo({ date, before: cycle, after });
    }
  }
  async function logBleeding(date: string, finish: boolean) {
    if (!cycle || !latest || date < latest || date > today) return;
    const ends = { ...cycle.ends };
    if (finish) ends[latest] = date;
    else if (ends[latest] && ends[latest] < date) delete ends[latest];
    const after = { ...cycle, ends, bleedingDays: [...new Set([...(cycle.bleedingDays ?? []), date])].sort() };
    if (await save(after)) { onRecorded(date); setUndo({ date, before: cycle, after }); }
  }
  function quickButton(date: string, label: string, primary = false) {
    const recorded = !!cycle?.starts.includes(date);
    const disabled = !loaded || busy || recorded;
    const color = primary ? '#FFFFFF' : theme.text;
    return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label + (recorded ? ', bereits eingetragen' : ', Periodenbeginn eintragen')} accessibilityState={{ disabled }} disabled={disabled} onPress={() => void record(date)}
      style={[styles.quick, { backgroundColor: primary ? '#963457' : theme.pillBg }]}>
      <Ionicons name={recorded ? 'checkmark-circle' : primary ? 'water' : 'add-circle-outline'} size={20} color={color} />
      <Text style={{ color, fontWeight: '700', flexShrink: 1 }}>{label}</Text>
    </TouchableOpacity>;
  }
  const button = (label: string, action: () => void) => <TouchableOpacity disabled={!loaded || busy} accessibilityRole="button" onPress={action} style={{ paddingVertical: 10 }}><Text style={{ color: theme.accent }}>{label}</Text></TouchableOpacity>;
  return <View style={[styles.panel, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
    {failed && <TouchableOpacity onPress={() => void loadCycle()}><Text style={{ color: theme.text }}>Zyklusdaten konnten nicht geladen werden. Erneut versuchen</Text></TouchableOpacity>}
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Periodenbeginn eintragen</Text>
    {!edit && <>
      <View style={styles.actions}>{quickButton(today, 'Heute', true)}{quickButton(yesterday, 'Gestern')}</View>
      {latest && cycle && <View>
        {button('Heute Blutung', () => void logBleeding(today, false))}
        {selected < today && selected >= latest && button('Blutung am gewählten Tag eintragen', () => void logBleeding(selected, false))}
        {selected >= latest && selected <= today && !cycle.bleedingDays?.some(day => day > selected) && button('Periode beendet · letzter Blutungstag ' + localDate(selected).toLocaleDateString('de-DE'), () => void logBleeding(selected, true))}
      </View>}
      {selected < yesterday && quickButton(selected, localDate(selected).toLocaleDateString('de-DE', { day:'numeric', month:'long', year:'numeric' }) + ' eintragen')}
      {undo && cycle === undo.after ? <View style={styles.feedback}>
        <Text accessibilityLiveRegion="polite" style={{ flex: 1, color: theme.text }}>{localDate(undo.date).toLocaleDateString('de-DE')} eingetragen</Text>
        {button('Rückgängig', () => { void save(undo.before); })}
      </View> : latest && <Text style={{ color: theme.subtext }}>Letzter Beginn am {localDate(latest).toLocaleDateString('de-DE')}</Text>}
      {!cycle && <Text style={{ color: theme.subtext }}>Voreinstellung: 28 Tage Zyklus, 5 Tage Blutung.</Text>}
    </>}
    {!edit && !!cycle?.starts.length && <>
      {button(history ? 'Verlauf schließen' : 'Eingetragene Perioden (' + cycle.starts.length + ')', () => setHistory(!history))}
      {history && [...cycle.starts].sort().reverse().map(date => <TouchableOpacity key={date} accessibilityRole="button" onPress={() => openEditor(date)} style={{paddingVertical:10}}>
        <Text style={{color:theme.text}}>{localDate(date).toLocaleDateString('de-DE')}{cycle.ends?.[date] ? ' – ' + localDate(cycle.ends[date]).toLocaleDateString('de-DE') : ''} · Bearbeiten</Text>
      </TouchableOpacity>)}
    </>}
    {button(edit ? 'Eingabe schließen' : 'Vergangene Periode eintragen', () => edit ? setEdit(false) : openEditor(null))}
    {edit && <>
      <Text style={{ color: theme.text }}>Erster Blutungstag: {localDate(start).toLocaleDateString('de-DE')}</Text>
      <DateTimePicker value={localDate(start)} mode="date" display="spinner" maximumDate={new Date()} onValueChange={(_, date) => { const key = dayKey(date); setStart(key); if (end && end < key) setEnd(key); }} />
      {button(end ? 'Letzten Blutungstag entfernen' : 'Letzten Blutungstag hinzufügen', () => setEnd(end ? null : start))}
      {end && <><Text style={{ color: theme.text }}>Letzter Blutungstag · {localDate(end).toLocaleDateString('de-DE')}</Text>
        <DateTimePicker value={localDate(end)} mode="date" display="spinner" minimumDate={localDate(start)} maximumDate={new Date()} onValueChange={(_, date) => setEnd(dayKey(date))} /></>}
      {button('Zykluslänge: ' + (automatic ? 'automatisch aus Verlauf' : 'manuell'), () => setAutomatic(!automatic))}
      {[[length, setLength, automatic ? 'Startwert in Tagen' : 'Zykluslänge in Tagen'], [bleeding, setBleeding, 'Blutungsdauer in Tagen']].map(([value, setter, label]) => <View key={String(label)}><Text style={{ color: theme.text }}>{String(label)}</Text><TextInput accessibilityLabel={String(label)} value={String(value)} keyboardType="number-pad" onChangeText={setter as (s:string)=>void} style={{ color: theme.text, padding: 8, backgroundColor: theme.inputBg }} /></View>)}
      <Text style={{ color: theme.subtext }}>Prognosen können um mehrere Tage abweichen. Zur Verhütung ungeeignet.</Text>
      {button('Periode speichern', () => {
        const n = Number(length), b = Number(bleeding);
        if (!Number.isInteger(n) || n < 16 || n > 90 || !Number.isInteger(b) || b < 1 || b >= n) return Alert.alert('Bitte prüfe Zykluslänge (16–90 Tage) und Blutungsdauer.');
        try {
          const base = { ...cycle, starts: cycle?.starts ?? [], length: n, bleeding: b, automatic };
          const after = enterPeriod(base, start, end, dayKey(new Date()), replacing);
          void save(after).then(ok => { if (ok) { onRecorded(start); setUndo({date:start,before:cycle,after}); } });
        } catch (error) { Alert.alert('Periode prüfen', (error as Error).message); }
      })}
      {cycle && button('Zyklusdaten löschen', () => Alert.alert('Alle lokalen Zyklusdaten löschen?', '', [{ text:'Abbrechen' }, { text:'Löschen', style:'destructive', onPress:()=>void save(null) }]))}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  quick: { flexGrow: 1, minHeight: 46, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
