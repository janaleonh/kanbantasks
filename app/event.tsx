import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayKey, localDate } from '../src/calendar/dates';
import { buildEventChanges, canWriteCalendar, changeDraftStart, draftFromEvent, toggleAllDay, validTimeZone, type EventDraft, type RepeatMode } from '../src/calendar/eventDraft';
import { CalendarApiError, createCalendarEvent, deleteCalendarEvent, fetchCalendarEvent, moveCalendarEvent, updateCalendarEvent } from '../src/calendar/googleCalendarApi';
import type { GoogleCalendarEvent } from '../src/calendar/types';
import { EVENT_COLORS } from '../src/calendar/eventColors';
import { EventDatePicker } from '../src/components/EventDatePicker';
import { useCalendarStore } from '../src/stores/useCalendarStore';
import { useTheme } from '../src/hooks/useTheme';

const REPEATS: { id: RepeatMode; label: string }[] = [
  { id: 'none', label: 'Nie' }, { id: 'daily', label: 'Täglich' }, { id: 'weekdays', label: 'Mo–Fr' }, { id: 'weekly', label: 'Wöchentlich' }, { id: 'monthly', label: 'Monatlich' }, { id: 'yearly', label: 'Jährlich' },
];

export default function EventScreen() {
  const [advanced, setAdvanced] = useState(false);
  const params = useLocalSearchParams<{ calendarId?: string; eventId?: string; date?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, calendars, selectedIds, refreshAfterMutation, selectCalendars } = useCalendarStore();
  const [sourceCalendarId, setSourceCalendarId] = useState(params.calendarId || '');
  const [targetCalendarId, setTargetCalendarId] = useState(params.calendarId || '');
  const [original, setOriginal] = useState<GoogleCalendarEvent | null>(null);
  const [instance, setInstance] = useState<GoogleCalendarEvent | null>(null);
  const [scope, setScope] = useState<'single' | 'series'>('single');
  const [draft, setDraft] = useState<EventDraft>(() => draftFromEvent(undefined, params.date ? localDate(params.date) : new Date()));
  const [loading, setLoading] = useState(!!params.eventId);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const editorAccount = useRef<string | null>(null);
  const initialized = useRef(false);
  const requestVersion = useRef(0);
  const saving = useRef(false);
  const insertId = useRef(Crypto.randomUUID().replace(/-/g, ''));
  const writable = calendars.filter((calendar) => canWriteCalendar(calendar.accessRole));
  const sourceCalendar = calendars.find((calendar) => calendar.id === sourceCalendarId);
  const readOnly = original ? !canWriteCalendar(sourceCalendar?.accessRole) || !!original.locked : !writable.length;
  const canMove = !!original && !original.recurringEventId && (!original.eventType || original.eventType === 'default') && original.organizer?.self !== false && !readOnly;
  const pickerZone = validTimeZone(draft.timeZone) ? draft.timeZone : undefined;

  const reportError = (err: unknown, prefix = '') => {
    const message = err instanceof Error ? err.message : 'Die Kalenderaktion ist fehlgeschlagen.';
    setError(prefix + message);
    if (err instanceof CalendarApiError && err.reconnect) useCalendarStore.setState({ needsReconnect: true, error: message });
    setConflict(err instanceof CalendarApiError && err.status === 412);
  };
  const loadEvent = async (id: string, nextScope: 'single' | 'series' = 'single') => {
    const version = ++requestVersion.current;
    const expectedAccount = useCalendarStore.getState().account;
    setLoading(true); setError(null); setConflict(false);
    try {
      const resource = await fetchCalendarEvent(params.calendarId!, id);
      if (version !== requestVersion.current || expectedAccount !== useCalendarStore.getState().account) return;
      if (!resource.start || !resource.end || resource.status === 'cancelled') throw new Error('Dieser Termin ist nicht mehr verfügbar.');
      setOriginal(resource);
      if (resource.recurringEventId) setInstance(resource);
      setDraft(draftFromEvent(resource, new Date(), calendars.find((calendar) => calendar.id === params.calendarId)?.timeZone));
      setScope(nextScope); setDirty(false); setReady(true);
      setSourceCalendarId(params.calendarId!); setTargetCalendarId(params.calendarId!);
    } catch (err) { if (version === requestVersion.current) reportError(err); }
    finally { if (version === requestVersion.current) setLoading(false); }
  };

  useEffect(() => {
    if (initialized.current || !account || !calendars.length) return;
    initialized.current = true;
    editorAccount.current = account;
    if (params.eventId && params.calendarId) { void loadEvent(params.eventId); }
    else {
      const calendar = writable.find((c) => c.id === params.calendarId) || writable.find((c) => selectedIds.includes(c.id)) || writable.find((c) => c.primary) || writable[0];
      setTargetCalendarId(calendar?.id || '');
      setSourceCalendarId(calendar?.id || '');
      setDraft(draftFromEvent(undefined, params.date ? localDate(params.date) : new Date(), calendar?.timeZone));
      setReady(true);
    }
  }, [account, calendars, params.eventId, params.calendarId]);
  useEffect(() => () => { requestVersion.current++; }, []);

  const change = <K extends keyof EventDraft>(field: K, value: EventDraft[K]) => { setDraft((current) => ({ ...current, [field]: value })); setDirty(true); };
  const close = () => {
    if (busy) return;
    if (dirty) Alert.alert('Änderungen verwerfen?', 'Deine Änderungen wurden noch nicht gespeichert.', [{ text: 'Weiter bearbeiten', style: 'cancel' }, { text: 'Verwerfen', style: 'destructive', onPress: () => router.back() }]);
    else router.back();
  };
  const assertAccount = () => {
    if (!editorAccount.current || useCalendarStore.getState().account !== editorAccount.current) throw new Error('Das Google-Konto hat sich geändert. Bitte öffne den Termin erneut.');
  };
  const refresh = () => { void refreshAfterMutation([draft.start, draft.end]); };

  const save = async () => {
    if (saving.current || readOnly || !ready) return;
    let patched = false;
    saving.current = true; setBusy(true); setError(null); setConflict(false);
    try {
      assertAccount();
      if (!writable.some((calendar) => calendar.id === targetCalendarId)) throw new Error('Bitte wähle einen Kalender mit Schreibzugriff.');
      const changes = buildEventChanges(draft, !!original?.recurringEventId);
      let resource: GoogleCalendarEvent;
      if (original) {
        resource = await updateCalendarEvent(sourceCalendarId, original.id, changes, original.etag);
        patched = true;
        assertAccount();
        setOriginal(resource);
        if (sourceCalendarId !== targetCalendarId) {
          if (!canMove) throw new Error('Dieser Termin kann nicht in einen anderen Kalender verschoben werden.');
          resource = await moveCalendarEvent(sourceCalendarId, resource.id, targetCalendarId, resource.etag);
          assertAccount();
          setSourceCalendarId(targetCalendarId); setOriginal(resource);
        }
      } else {
        resource = await createCalendarEvent(targetCalendarId, insertId.current, changes);
        assertAccount();
      }
      if (!useCalendarStore.getState().selectedIds.includes(targetCalendarId)) await selectCalendars([...useCalendarStore.getState().selectedIds, targetCalendarId]);
      refresh(); setDirty(false); router.back();
    } catch (err) {
      reportError(err, patched ? 'Die Änderungen wurden gespeichert, aber der Kalenderwechsel ist fehlgeschlagen. ' : '');
      if (patched && useCalendarStore.getState().account === editorAccount.current) refresh();
    } finally { saving.current = false; setBusy(false); }
  };
  const remove = () => {
    if (!original || busy || readOnly) return;
    Alert.alert(scope === 'series' ? 'Gesamte Serie löschen?' : 'Termin löschen?', scope === 'series' ? 'Alle Vorkommen dieser Serie werden aus Google Kalender gelöscht.' : `„${original.summary || 'Ohne Titel'}“ wird aus Google Kalender gelöscht.`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => {
        if (saving.current) return;
        saving.current = true; setBusy(true);
        void (async () => {
          try { assertAccount(); await deleteCalendarEvent(sourceCalendarId, original.id, original.etag); assertAccount(); refresh(); setDirty(false); router.back(); }
          catch (err) { reportError(err); }
          finally { saving.current = false; setBusy(false); }
        })();
      } },
    ]);
  };
  const duplicate = () => {
    insertId.current = Crypto.randomUUID().replace(/-/g, '');
    setOriginal(null); setInstance(null); setScope('single');
    setDraft((current) => ({ ...current, title: `${current.title} (Kopie)` }));
    const destination = writable.find((calendar) => calendar.id === targetCalendarId) || writable[0];
    setTargetCalendarId(destination?.id || ''); setDirty(true); setError(null); setConflict(false);
  };
  const actions = () => Alert.alert('Terminaktionen', undefined, [
    ...(writable.length ? [{ text: 'Duplizieren', onPress: duplicate }] : []),
    ...(original?.htmlLink && /^https:\/\/(calendar\.google\.com|www\.google\.com)\//.test(original.htmlLink) ? [{ text: 'In Google Kalender öffnen', onPress: () => { void Linking.openURL(original.htmlLink!).catch(() => setError('Google Kalender konnte nicht geöffnet werden.')); } }] : []),
    ...(!readOnly ? [{ text: 'Löschen', style: 'destructive' as const, onPress: remove }] : []),
    { text: 'Abbrechen', style: 'cancel' },
  ]);
  const switchScope = (next: 'single' | 'series') => {
    if (!instance || scope === next || busy) return;
    const run = () => { void loadEvent(next === 'series' ? instance.recurringEventId! : instance.id, next); };
    if (dirty) Alert.alert('Änderungen verwerfen?', 'Beim Wechsel zwischen Einzeltermin und Serie werden ungespeicherte Änderungen verworfen.', [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Wechseln', style: 'destructive', onPress: run }]);
    else run();
  };
  const choices = <T extends string>(value: T, options: { id: T; label: string }[], onChange: (id: T) => void) => <View style={styles.choices}>{options.map((option) => <TouchableOpacity key={option.id} accessibilityRole="radio" accessibilityState={{ selected: value === option.id }} onPress={() => onChange(option.id)} style={[styles.chip, { backgroundColor: value === option.id ? theme.accent : theme.pillBg }]}><Text style={{ color: value === option.id ? theme.onAccent ?? '#FFFFFF' : theme.text }}>{option.label}</Text></TouchableOpacity>)}</View>;
  const label = (text: string) => <Text style={[styles.label, { color: theme.subtext }]}>{text}</Text>;
  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.cardBg, borderColor: theme.border }];

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}>
    <Stack.Screen options={{ headerTitle: original ? 'Termin bearbeiten' : 'Neuer Termin', gestureEnabled: !dirty && !busy, headerLeft: () => <TouchableOpacity accessibilityRole="button" accessibilityLabel="Schließen" onPress={close} disabled={busy} style={styles.headerButton}><Ionicons name="close" size={24} color={theme.text} /></TouchableOpacity>, headerRight: () => original && !loading ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Terminaktionen" disabled={busy} onPress={actions} style={styles.headerButton}><Ionicons name="ellipsis-horizontal-circle-outline" size={25} color={theme.text} /></TouchableOpacity> : null }} />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {loading && <ActivityIndicator color={theme.accent} style={styles.spinner} />}
      {error && <View style={[styles.error, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
        <Text accessibilityRole="alert" style={{ color: theme.isDark ? '#FFAEA5' : '#B42318', lineHeight: 21 }}>{error}</Text>
        {conflict || (!ready && params.eventId) ? <TouchableOpacity onPress={() => { void loadEvent(scope === 'series' ? instance!.recurringEventId! : params.eventId!, scope); }}><Text style={{ color: theme.accent }}>Termin neu laden (ungespeicherte Änderungen verwerfen)</Text></TouchableOpacity> : null}
        {useCalendarStore.getState().needsReconnect && <TouchableOpacity onPress={() => router.push('/settings')}><Text style={{ color: theme.accent }}>Google-Zugriff aktualisieren</Text></TouchableOpacity>}
      </View>}
      {!account && <TouchableOpacity onPress={() => router.push('/settings')}><Text style={{ color: theme.accent }}>Bitte verbinde zuerst deinen Google Kalender in den Einstellungen.</Text></TouchableOpacity>}
      {ready && !loading && <>
        {instance && <View style={styles.section}>{label('SERIENTERMIN')}{choices(scope, [{ id: 'single', label: 'Nur dieser Termin' }, { id: 'series', label: 'Gesamte Serie' }], switchScope)}{scope === 'series' && <Text style={[styles.hint, { color: theme.subtext }]}>Du bearbeitest den ursprünglichen Beginn und alle Vorkommen der Serie.</Text>}</View>}
        {readOnly && <Text style={[styles.hint, { color: theme.subtext }]}>Dieser Kalender oder Termin ist schreibgeschützt. Du kannst ihn ansehen{writable.length ? ' und in einen eigenen Kalender duplizieren' : ''}.</Text>}
        <View pointerEvents={readOnly || busy ? 'none' : 'auto'} style={{ opacity: readOnly ? 0.75 : 1 }}>
          <View style={styles.section}>{label('TITEL')}<TextInput accessibilityLabel="Termintitel" style={[inputStyle, styles.titleInput]} value={draft.title} onChangeText={(value) => change('title', value)} placeholder="Titel hinzufügen" placeholderTextColor={theme.subtext} /></View>
          <View style={styles.section}>{label('KALENDER')}
            {original && !canMove ? <Text style={{ color: theme.text }}>{sourceCalendar?.summaryOverride || sourceCalendar?.summary || sourceCalendarId}</Text> : choices(targetCalendarId, writable.map((calendar) => ({ id: calendar.id, label: calendar.summaryOverride || calendar.summary })), (id) => { setTargetCalendarId(id); setDirty(true); })}
            {!writable.length && <Text style={[styles.hint, { color: theme.subtext }]}>Kein Kalender mit Schreibzugriff verfügbar.</Text>}
          </View>
          <View style={[styles.section, styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.switchRow}><Text style={{ color: theme.text, fontSize: 15 }}>Ganztägig</Text><Switch accessibilityLabel="Ganztägiger Termin" value={draft.allDay} trackColor={{ true: theme.accent }} onValueChange={(allDay) => {
              if (!validTimeZone(draft.timeZone)) { setError('Bitte korrigiere zuerst die Zeitzone.'); return; }
              setDraft((current) => toggleAllDay(current, allDay)); setDirty(true);
            }} /></View>
            <EventDatePicker label="Beginn" value={draft.start} allDay={draft.allDay} timeZone={pickerZone} onChange={(start) => {
              setDraft((current) => changeDraftStart(current, start)); setDirty(true);
            }} />
            <EventDatePicker label={draft.allDay ? 'Letzter Tag' : 'Ende'} value={draft.end} allDay={draft.allDay} timeZone={pickerZone} onChange={(end) => change('end', end)} />
          </View>
          {!original && <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:advanced}} onPress={()=>setAdvanced(!advanced)} style={styles.section}><Text style={{color:theme.accent}}>{advanced?'Weitere Optionen schließen':'Weitere Optionen'}</Text></TouchableOpacity>}
          {(original || advanced) && <>{!draft.allDay && <View style={styles.section}>{label('ZEITZONE')}<TextInput accessibilityLabel="Zeitzone" autoCapitalize="none" autoCorrect={false} style={inputStyle} value={draft.timeZone} onChangeText={(value) => change('timeZone', value)} placeholder="Europe/Berlin" placeholderTextColor={theme.subtext} /><Text style={[styles.hint, { color: theme.subtext }]}>Datum und Uhrzeit werden in dieser Zeitzone angezeigt.</Text></View>}
          <View style={styles.section}>{label('ORT')}<TextInput accessibilityLabel="Ort" style={inputStyle} value={draft.location} onChangeText={(value) => change('location', value)} placeholder="Ort hinzufügen" placeholderTextColor={theme.subtext} /></View>
          <View style={styles.section}>{label('BESCHREIBUNG')}<TextInput accessibilityLabel="Beschreibung" style={[inputStyle, styles.notes]} value={draft.description} onChangeText={(value) => change('description', value)} placeholder="Notizen hinzufügen" placeholderTextColor={theme.subtext} multiline scrollEnabled textAlignVertical="top" /></View>
          {!original?.recurringEventId && <View style={styles.section}>{label('WIEDERHOLEN')}
            {choices(draft.repeat, [...(draft.originalRecurrence.length ? [{ id: 'keep' as const, label: 'Bestehende Regel behalten' }] : []), ...REPEATS], (value) => change('repeat', value))}
            {draft.repeat === 'keep' && <Text style={[styles.hint, { color: theme.subtext }]}>Die bestehende Wiederholungsregel einschließlich Ausnahmen bleibt erhalten.</Text>}
            {draft.repeat !== 'none' && draft.repeat !== 'keep' && <>
              {label('INTERVALL')}<TextInput accessibilityLabel="Wiederholungsintervall" keyboardType="number-pad" style={inputStyle} value={draft.interval} onChangeText={(value) => change('interval', value)} />
              {draft.repeat === 'weekly' && <View style={styles.choices}>{['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map((id, i) => <TouchableOpacity key={id} accessibilityRole="checkbox" accessibilityState={{ checked: draft.weekdays.includes(id) }} onPress={() => change('weekdays', draft.weekdays.includes(id) ? draft.weekdays.filter((d) => d !== id) : [...draft.weekdays, id])} style={[styles.chip, { backgroundColor: draft.weekdays.includes(id) ? theme.accent : theme.pillBg }]}><Text style={{ color: draft.weekdays.includes(id) ? theme.onAccent ?? '#FFFFFF' : theme.text }}>{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i]}</Text></TouchableOpacity>)}</View>}
              {draft.repeat === 'monthly' && choices(draft.monthlyMode, [{ id: 'date', label: 'Am gleichen Datum' }, { id: 'weekday', label: 'Am gleichen Wochentag' }], (value) => change('monthlyMode', value))}
              {label('SERIE ENDET')}{choices(draft.repeatEnd, [{ id: 'never', label: 'Nie' }, { id: 'on', label: 'Am Datum' }, { id: 'count', label: 'Nach Anzahl' }], (value) => change('repeatEnd', value))}
              {draft.repeatEnd === 'on' && <EventDatePicker label="Bis einschließlich" value={draft.until} allDay onChange={(date) => change('until', date)} />}
              {draft.repeatEnd === 'count' && <TextInput accessibilityLabel="Anzahl der Wiederholungen" keyboardType="number-pad" style={inputStyle} value={draft.count} onChangeText={(value) => change('count', value)} />}
            </>}
          </View>}
          <View style={styles.section}>{label('ERINNERUNGEN')}{choices(draft.reminderMode, [{ id: 'default', label: 'Kalenderstandard' }, { id: 'none', label: 'Keine' }, { id: 'custom', label: 'Eigene' }], (value) => {
            change('reminderMode', value);
            if (value === 'custom' && !draft.reminders.length) change('reminders', [{ method: 'popup', minutes: '10' }]);
          })}
            {draft.reminderMode === 'custom' && <>
              {draft.reminders.map((reminder, i) => <View key={i} style={[styles.reminder, { borderColor: theme.border }]}>
                {choices(reminder.method, [{ id: 'popup', label: 'Mitteilung' }, { id: 'email', label: 'E-Mail' }], (method) => change('reminders', draft.reminders.map((r, index) => index === i ? { ...r, method } : r)))}
                <View style={styles.switchRow}><TextInput accessibilityLabel={`Erinnerung ${i + 1}, Minuten vorher`} style={[inputStyle, { flex: 1 }]} keyboardType="number-pad" value={reminder.minutes} onChangeText={(minutes) => change('reminders', draft.reminders.map((r, index) => index === i ? { ...r, minutes } : r))} /><Text style={{ color: theme.subtext }}>Min. vorher</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Erinnerung entfernen" onPress={() => change('reminders', draft.reminders.filter((_, index) => index !== i))} style={styles.headerButton}><Ionicons name="close-circle-outline" color={theme.subtext} size={22} /></TouchableOpacity></View>
              </View>)}
              {draft.reminders.length < 5 && <TouchableOpacity onPress={() => change('reminders', [...draft.reminders, { method: 'popup', minutes: '30' }])} style={styles.link}><Text style={{ color: theme.accent }}>+ Erinnerung hinzufügen</Text></TouchableOpacity>}
            </>}
          </View>
          <View style={styles.section}>{label('VERFÜGBARKEIT')}{choices(draft.transparency, [{ id: 'opaque', label: 'Beschäftigt' }, { id: 'transparent', label: 'Verfügbar' }], (value) => change('transparency', value))}</View>
          <View style={styles.section}>{label('SICHTBARKEIT')}{choices(draft.visibility, [{ id: 'default', label: 'Kalenderstandard' }, { id: 'private', label: 'Privat' }, { id: 'public', label: 'Öffentlich' }, ...(draft.visibility === 'confidential' ? [{ id: 'confidential' as const, label: 'Vertraulich' }] : [])], (value) => change('visibility', value))}</View>
          <View style={styles.section}>{label('TERMINFARBE')}<View style={styles.choices}>{EVENT_COLORS.map((color, index) => {
            const id = index ? String(index) : '';
            return <TouchableOpacity key={id} accessibilityRole="radio" accessibilityLabel={index ? `Terminfarbe ${index}` : 'Kalenderfarbe'} accessibilityState={{ selected: draft.colorId === id }} onPress={() => change('colorId', id)} style={[styles.color, { backgroundColor: color || sourceCalendar?.backgroundColor || theme.accent, borderColor: draft.colorId === id ? theme.text : 'transparent' }]}>{draft.colorId === id && <Ionicons name="checkmark" size={20} color="#FFFFFF" />}</TouchableOpacity>;
          })}</View></View></>}
        </View>
      </>}
    </ScrollView>
    {ready && !readOnly && <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderTopColor: theme.border }]}><TouchableOpacity accessibilityRole="button" disabled={busy || loading || conflict} onPress={() => { void save(); }} style={[styles.saveButton, { backgroundColor: theme.accent, opacity: busy || loading || conflict ? 0.5 : 1 }]}>{busy ? <ActivityIndicator color={theme.onAccent ?? '#FFFFFF'} /> : <Ionicons name="checkmark" color={theme.onAccent ?? '#FFFFFF'} size={20} />}<Text style={{ color: theme.onAccent ?? '#FFFFFF', fontSize: 16, fontWeight: '700' }}>{busy ? 'Wird gespeichert …' : 'Speichern'}</Text></TouchableOpacity></View>}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 32 }, section: { marginBottom: 23 }, label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 9 },
  input: { borderRadius: 12, borderWidth: 1, padding: 13, fontSize: 15 }, titleInput: { fontSize: 22, fontWeight: '600' }, notes: { minHeight: 100, maxHeight: 180 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 }, chip: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10 },
  group: { padding: 12, borderWidth: 1, borderRadius: 16 }, switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  hint: { fontSize: 12, lineHeight: 19, marginVertical: 8 }, error: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 12, marginBottom: 18 },
  footer: { padding: 16, borderTopWidth: 1 }, saveButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, padding: 15, borderRadius: 14 },
  headerButton: { padding: 10 }, link: { paddingVertical: 12 }, reminder: { paddingVertical: 9, borderBottomWidth: 1, marginBottom: 10 },
  color: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, justifyContent: 'center', alignItems: 'center' }, spinner: { margin: 24 },
});
