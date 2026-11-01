import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

export function EventDatePicker({ label, value, onChange, allDay = false, timeZone }: { label: string; value: Date; onChange: (date: Date) => void; allDay?: boolean; timeZone?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const dateLabel = value.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: allDay ? undefined : timeZone });
  const timeLabel = value.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: allDay ? undefined : timeZone });
  const picker = mode && <DateTimePicker value={value} mode={mode} display={Platform.OS === 'ios' ? 'spinner' : 'default'} timeZoneName={allDay ? undefined : timeZone} locale="de-DE" is24Hour themeVariant={theme.isDark ? 'dark' : 'light'} onChange={(event, date) => {
    if (Platform.OS !== 'ios') setMode(null);
    if (event.type !== 'dismissed' && date) onChange(date);
  }} />;
  return <View style={styles.row}>
    <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}, Datum ${dateLabel}`} onPress={() => setMode('date')} style={[styles.button, { backgroundColor: theme.pillBg }]}><Text style={{ color: theme.text }}>{dateLabel}</Text></TouchableOpacity>
    {!allDay && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}, Uhrzeit ${timeLabel}`} onPress={() => setMode('time')} style={[styles.button, { backgroundColor: theme.pillBg }]}><Text style={{ color: theme.text }}>{timeLabel}</Text></TouchableOpacity>}
    {Platform.OS === 'ios' ? <Modal visible={!!mode} transparent animationType="slide" onRequestClose={() => setMode(null)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMode(null)} />
        <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.pickerHeading}><Text style={[styles.label, { color: theme.text }]}>{label}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setMode(null)} style={styles.done}><Text style={{ color: theme.accent, fontWeight: '700' }}>Fertig</Text></TouchableOpacity></View>
          {picker}
        </View>
      </View>
    </Modal> : picker}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginVertical: 8 }, label: { fontSize: 15, fontWeight: '600', flex: 1 },
  button: { paddingHorizontal: 10, paddingVertical: 11, borderRadius: 9 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }, sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16 },
  pickerHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, done: { padding: 12 },
});
