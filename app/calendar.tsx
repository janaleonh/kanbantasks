import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarAgenda } from '../src/components/CalendarAgenda';
import { CalendarWeek } from '../src/components/CalendarWeek';
import { dayKey, eventsForDay, localDate, monthKey, weekDays } from '../src/calendar/dates';
import { useCalendarStore } from '../src/stores/useCalendarStore';
import { useTheme } from '../src/hooks/useTheme';
import { canWriteCalendar } from '../src/calendar/eventDraft';

export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, calendars, selectedIds, todayKey, eventsByMonth, loadingMonths, error, loadMonth } = useCalendarStore();
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()));
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [query, setQuery] = useState('');
  const canCreate = !!account && calendars.some((calendar) => canWriteCalendar(calendar.accessRole));
  const addEvent = (date: Date) => router.push({ pathname: '/event', params: { date: dayKey(date) } });
  const selectedDate = localDate(selectedDay);
  const key = monthKey(selectedDate);
  const week = useMemo(() => weekDays(localDate(selectedDay)), [selectedDay]);
  const visibleMonthKeys = view === 'week' ? [...new Set(week.map(monthKey))] : [key];
  const visibleMonthSignature = visibleMonthKeys.join('|');
  const selectedSignature = selectedIds.join('|');
  const calendarSignature = calendars.map((calendar) => calendar.id).join('|');
  useEffect(() => {
    for (const month of visibleMonthSignature.split('|')) void loadMonth(localDate(`${month}-01`));
  }, [visibleMonthSignature, selectedSignature, calendarSignature, loadMonth]);
  const searchedMonths = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eventsByMonth;
    return Object.fromEntries(Object.entries(eventsByMonth).map(([month, events]) => [month, events.filter((event) => `${event.title} ${event.location} ${event.calendarTitle}`.toLowerCase().includes(q))]));
  }, [eventsByMonth, query]);
  const events = searchedMonths[key] || [];
  const days = useMemo(() => {
    const first = localDate(`${key}-01`);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
      const date = new Date(first.getFullYear(), first.getMonth(), i - offset + 1);
      return { date, id: dayKey(date), inMonth: monthKey(date) === key };
    });
  }, [key]);
  const loading = visibleMonthKeys.some((month) => loadingMonths.includes(month));
  const shiftRange = (delta: number) => {
    const date = view === 'week'
      ? new Date(week[0].getFullYear(), week[0].getMonth(), week[0].getDate() + delta * 7)
      : view === 'day' ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + delta)
      : new Date(selectedDate.getFullYear(), selectedDate.getMonth() + delta, 1);
    setSelectedDay(dayKey(date));
  };
  const refresh = () => { for (const month of visibleMonthKeys) void loadMonth(localDate(`${month}-01`), true); };
  const dayEvents = eventsForDay(events, selectedDate, selectedIds);
  const hasCachedEvents = visibleMonthKeys.some((month) => (eventsByMonth[month] || []).length > 0);
  const rangeTitle = view === 'week'
    ? `${week[0].toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', ...(week[0].getFullYear() !== week[6].getFullYear() ? { year: 'numeric' as const } : {}) })} – ${week[6].toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    : selectedDate.toLocaleDateString('de-DE', view === 'day' ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' } : { month: 'long', year: 'numeric' });

  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={loading} tintColor={theme.accent} onRefresh={refresh} />}>
    {canCreate && <TouchableOpacity accessibilityRole="button" onPress={() => addEvent(selectedDate)} style={[styles.addEvent, { backgroundColor: theme.accent }]}><Ionicons name="add" size={21} color={theme.onAccent ?? '#FFFFFF'} /><Text style={{ color: theme.onAccent ?? '#FFFFFF', fontWeight: '700' }}>Neuer Termin</Text></TouchableOpacity>}
    <View style={[styles.viewPicker, { backgroundColor: theme.pillBg }]}>
      {([{ id: 'day', label: 'Tag' }, { id: 'week', label: 'Woche' }, { id: 'month', label: 'Monat' }] as const).map((option) => <TouchableOpacity key={option.id} accessibilityRole="tab" accessibilityState={{ selected: view === option.id }} onPress={() => setView(option.id)} style={[styles.viewOption, { backgroundColor: view === option.id ? theme.surface : 'transparent' }]}>
        <Text style={{ color: view === option.id ? theme.text : theme.subtext, fontWeight: '600' }}>{option.label}</Text>
      </TouchableOpacity>)}
    </View>
    <View style={styles.monthRow}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={view === 'week' ? 'Vorherige Woche' : view === 'day' ? 'Vorheriger Tag' : 'Vorheriger Monat'} onPress={() => shiftRange(-1)} style={styles.arrow}><Ionicons name="chevron-back" size={22} color={theme.accent} /></TouchableOpacity>
      <Text accessibilityRole="header" style={[styles.monthTitle, { color: theme.text, fontFamily: theme.headingFont, fontSize: view === 'month' ? 23 : 18 }]}>{rangeTitle}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={view === 'week' ? 'Nächste Woche' : view === 'day' ? 'Nächster Tag' : 'Nächster Monat'} onPress={() => shiftRange(1)} style={styles.arrow}><Ionicons name="chevron-forward" size={22} color={theme.accent} /></TouchableOpacity>
    </View>
    {view === 'month' && <View style={[styles.month, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.columnRadius }]}>
      <View style={styles.grid}>{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => <View key={day} style={styles.cell}><Text style={[styles.weekday, { color: theme.subtext }]}>{day}</Text></View>)}</View>
      <View style={styles.grid}>{days.map(({ date, id, inMonth }) => {
        const active = id === selectedDay;
        const hasEvents = inMonth && eventsForDay(events, date, selectedIds).length > 0;
        return <TouchableOpacity key={id} accessibilityRole="button" accessibilityState={{ selected: active, disabled: !inMonth }} accessibilityLabel={`${date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}${hasEvents ? ', mit Terminen' : ''}`} disabled={!inMonth} onPress={() => setSelectedDay(id)} onLongPress={canCreate ? () => addEvent(date) : undefined} style={styles.cell}>
          <View style={[styles.dayCircle, { backgroundColor: active ? theme.accent : 'transparent', borderColor: id === todayKey ? theme.accent : 'transparent' }]}>
            <Text style={{ fontSize: 16, fontWeight: active || id === todayKey ? '700' : '400', color: active ? theme.onAccent ?? '#FFFFFF' : inMonth ? theme.text : theme.subtext, opacity: inMonth ? 1 : 0.35 }}>{date.getDate()}</Text>
          </View>
          <View style={[styles.dot, { backgroundColor: hasEvents ? theme.accent : 'transparent' }]} />
        </TouchableOpacity>;
      })}</View>
    </View>}
    <View style={styles.agendaHeading}>
      <Text accessibilityRole="header" style={[styles.dayTitle, { color: theme.text }]}>{view === 'week' ? 'Deine Woche' : view === 'day' ? 'Dein Tag' : selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => setSelectedDay(todayKey)} style={styles.todayButton}><Text style={{ color: theme.accent, fontWeight: '600' }}>Heute</Text></TouchableOpacity>
    </View>
    {!!account && !!selectedIds.length && <View style={[styles.search, { backgroundColor: theme.inputBg, borderColor: theme.border }]}><Ionicons name="search" size={17} color={theme.subtext} /><TextInput accessibilityLabel="Termine im angezeigten Zeitraum suchen" placeholder={view === 'week' ? 'In dieser Woche suchen' : view === 'day' ? 'An diesem Tag suchen' : 'In diesem Monat suchen'} placeholderTextColor={theme.subtext} value={query} onChangeText={setQuery} style={{ flex: 1, color: theme.text, fontSize: 14 }} />{!!query && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Suche löschen" onPress={() => setQuery('')}><Ionicons name="close-circle" size={19} color={theme.subtext} /></TouchableOpacity>}</View>}
    {!account || !selectedIds.length ? <View style={[styles.notice, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Ionicons name="calendar-outline" size={28} color={theme.accent} />
      <Text style={[styles.noticeTitle, { color: theme.text }]}>{account ? 'Deine Kalender, dein Überblick.' : 'Verbinde deinen Google Kalender.'}</Text>
      <Text style={[styles.description, { color: theme.subtext }]}>Wähle in den Einstellungen die Kalender aus, deren Termine hier und in „Heute“ erscheinen sollen.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.settingsButton}><Text style={{ color: theme.accent, fontWeight: '600' }}>Kalender auswählen</Text></TouchableOpacity>
    </View> : <>
      {error && <View style={styles.error}>
        <Text accessibilityRole="alert" style={[styles.description, { color: theme.subtext }]}>{hasCachedEvents ? 'Zuletzt geladene Termine. ' : ''}{error}</Text>
        <TouchableOpacity onPress={() => router.push('/settings')}><Text style={{ color: theme.accent }}>Kalendereinstellungen öffnen</Text></TouchableOpacity>
      </View>}
      {view === 'week' ? <CalendarWeek days={week} selectedDay={selectedDay} todayKey={todayKey} eventsByMonth={searchedMonths} selectedIds={selectedIds} loadingMonths={loadingMonths} error={error} onAddEvent={canCreate ? addEvent : undefined} onSelectDay={(date) => { setSelectedDay(dayKey(date)); setView('day'); }} /> : <>
        {loading && <ActivityIndicator style={styles.spinner} color={theme.accent} />}
        {(!loading || !!dayEvents.length) && (!error || !!dayEvents.length) && <CalendarAgenda events={dayEvents} emptyText={query ? 'Keine passenden Termine an diesem Tag.' : undefined} />}
      </>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  addEvent: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 12, marginBottom: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  viewPicker: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 14 },
  viewOption: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 9 },
  content: { padding: 16 }, monthRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 23, fontWeight: '700', letterSpacing: -0.5 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  month: { padding: 8, borderWidth: 1 }, grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.285714%', alignItems: 'center', paddingVertical: 4, minHeight: 44 },
  weekday: { fontSize: 12, fontWeight: '600', marginTop: 10 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  agendaHeading: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 12, gap: 10 },
  dayTitle: { flex: 1, fontSize: 17, fontWeight: '700' }, todayButton: { padding: 10 },
  notice: { padding: 20, borderRadius: 18, borderWidth: 1, gap: 10 },
  noticeTitle: { fontSize: 19, fontWeight: '600' }, description: { fontSize: 13, lineHeight: 20 },
  settingsButton: { alignSelf: 'flex-start', paddingVertical: 10 }, error: { gap: 8, marginBottom: 14 }, spinner: { marginVertical: 14 },
});
