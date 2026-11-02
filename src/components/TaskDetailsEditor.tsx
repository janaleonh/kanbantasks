import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateUUID } from '../utils/uuid';
import { useTheme } from '../hooks/useTheme';
import { useDocumentStore } from '../stores/useDocumentStore';
import type { ChecklistItem, RepeatRule, TaskAttachment } from '../tasks/details';

type Props = {
  recurrence: RepeatRule | null; checklist: ChecklistItem[]; attachments: TaskAttachment[];
  onRecurrence: (rule: RepeatRule | null) => void; onChecklist: (items: ChecklistItem[]) => void; onAttachments: (items: TaskAttachment[]) => void;
  onOpenAttachment: (attachment: TaskAttachment) => void;
};
export function TaskDetailsEditor(props: Props) {
  const theme = useTheme(), insets = useSafeAreaInsets();
  const [itemTitle, setItemTitle] = useState(''), [picking, setPicking] = useState(false), [folder, setFolder] = useState('');
  const { config, manifest, browse, loadingFolder, folderError, home } = useDocumentStore();
  const text = { color: theme.text }, muted = { color: theme.subtext, fontSize: 12, lineHeight: 19 };
  const card = { backgroundColor: theme.cardBg, borderRadius: 12, padding: 13 };
  const label = { ...muted, fontWeight: '600' as const, marginBottom: 9 };
  const addItem = () => {
    if (!itemTitle.trim()) return;
    if (props.checklist.length >= 100) { Alert.alert('Checkliste', 'Bis zu 100 Punkte sind möglich.'); return; }
    props.onChecklist([...props.checklist, { id: generateUUID(), title: itemTitle.trim(), done: false }]); setItemTitle('');
  };
  const selectFolder = (path: string) => { setFolder(path); void browse(path); };
  return <>
    <View style={{ marginBottom: 20 }}>
      <Text style={label}>WIEDERHOLUNG</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([{ id: null, title: 'Keine' }, { id: 'daily', title: 'Täglich' }, { id: 'weekdays', title: 'Mo–Fr' }, { id: 'weekly', title: 'Wöchentlich' }, { id: 'monthly', title: 'Monatlich' }, { id: 'yearly', title: 'Jährlich' }] as const).map(option => <TouchableOpacity accessibilityRole="button" key={option.title} onPress={() => props.onRecurrence(option.id ? { frequency: option.id, interval: 1 } : null)} style={{ padding: 11, borderRadius: 10, backgroundColor: (props.recurrence?.frequency ?? null) === option.id ? theme.accent : theme.cardBg }}><Text style={{ color: (props.recurrence?.frequency ?? null) === option.id ? theme.onAccent ?? '#fff' : theme.text }}>{option.title}</Text></TouchableOpacity>)}
      </View>
      {props.recurrence && <>
        {props.recurrence.frequency !== 'weekdays' && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <Text style={muted}>Alle</Text><TextInput accessibilityLabel="Wiederholungsintervall" keyboardType="number-pad" value={String(props.recurrence.interval)} onChangeText={value => { const interval = Number(value); if (Number.isInteger(interval) && interval >= 1 && interval <= 99) props.onRecurrence({ ...props.recurrence!, interval }); }} style={{ ...card, ...text, minWidth: 55, textAlign: 'center' }} /><Text style={muted}> {({ daily: 'Tage', weekly: 'Wochen', monthly: 'Monate', yearly: 'Jahre', weekdays: 'Werktage' })[props.recurrence.frequency]}</Text>
        </View>}
        <Text style={[muted, { marginTop: 8 }]}>Beim Erledigen entsteht die nächste Aufgabe. Vergangene Wiederholungen werden übersprungen. Ohne Fälligkeit beginnt die Reihe ab heute.</Text>
      </>}
    </View>
    <View style={{ marginBottom: 20 }}>
      <Text style={label}>CHECKLISTE · {props.checklist.filter(item => item.done).length}/{props.checklist.length}</Text>
      {props.checklist.map(item => <View key={item.id} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={item.title} onPress={() => props.onChecklist(props.checklist.map(value => value.id === item.id ? { ...value, done: !value.done } : value))}><Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={theme.accent} /></TouchableOpacity>
        <TextInput accessibilityLabel="Checklistenpunkt bearbeiten" maxLength={500} value={item.title} onChangeText={title => props.onChecklist(props.checklist.map(value => value.id === item.id ? { ...value, title } : value))} style={{ flex: 1, ...text, textDecorationLine: item.done ? 'line-through' : 'none' }} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Checklistenpunkt entfernen" onPress={() => props.onChecklist(props.checklist.filter(value => value.id !== item.id))}><Ionicons name="close" size={20} color={theme.subtext} /></TouchableOpacity>
      </View>)}
      <View style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 8 }}><TextInput accessibilityLabel="Neuer Checklistenpunkt" value={itemTitle} onChangeText={setItemTitle} maxLength={500} placeholder="Schritt hinzufügen" placeholderTextColor={theme.subtext} onSubmitEditing={addItem} style={{ flex: 1, ...text }} /><TouchableOpacity accessibilityRole="button" accessibilityLabel="Checklistenpunkt hinzufügen" onPress={addItem}><Ionicons name="add-circle-outline" size={24} color={theme.accent} /></TouchableOpacity></View>
    </View>
    <View style={{ marginBottom: 20 }}>
      <Text style={label}>DOKUMENTE VOM NAS</Text>
      {props.attachments.map(attachment => <View key={attachment.id} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}><TouchableOpacity accessibilityRole="button" onPress={() => props.onOpenAttachment(attachment)} style={{ flex: 1 }}><Text style={text}>{attachment.name}</Text><Text numberOfLines={1} style={muted}>{attachment.path}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Dokumentverknüpfung entfernen" onPress={() => props.onAttachments(props.attachments.filter(value => value.id !== attachment.id))}><Ionicons name="close" size={20} color={theme.subtext} /></TouchableOpacity></View>)}
      <TouchableOpacity accessibilityRole="button" onPress={() => {
        if (!config) { Alert.alert('NAS einrichten', 'Verbinde zuerst dein NAS unter Einstellungen → Dokumente & NAS.'); return; }
        if (props.attachments.length >= 30) { Alert.alert('Dokumente', 'Bis zu 30 Verknüpfungen sind möglich.'); return; }
        setPicking(true); selectFolder('');
      }} style={{ ...card, flexDirection: 'row', gap: 8, alignItems: 'center' }}><Ionicons name="attach-outline" size={21} color={theme.accent} /><Text style={{ color: theme.accent }}>NAS-Dokument verknüpfen</Text></TouchableOpacity>
      <Text style={[muted, { marginTop: 8 }]}>Verknüpfungen enthalten keine Zugangsdaten. Für unterwegs kannst du das Dokument im Explorer als Offline-Favorit markieren.</Text>
    </View>
    <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top + 18, paddingHorizontal: 20, paddingBottom: insets.bottom + 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 }}><Text style={{ ...text, fontSize: 20, fontWeight: '700' }}>Dokument auswählen</Text><TouchableOpacity onPress={() => setPicking(false)}><Text style={{ color: theme.accent }}>Schließen</Text></TouchableOpacity></View>
        <Text style={[muted, { marginBottom: 10 }]}>{folder || 'Startordner'}{!home ? ' · Zuletzt geladene Ordner' : ''}</Text>
        {!!folder && <TouchableOpacity onPress={() => selectFolder(folder.split('/').slice(0, -1).join('/'))} style={{ paddingVertical: 12 }}><Text style={{ color: theme.accent }}>‹ Übergeordneter Ordner</Text></TouchableOpacity>}
        {!!folderError && <Text style={[muted, { marginBottom: 12 }]}>{folderError}</Text>}
        {loadingFolder && <ActivityIndicator color={theme.accent} />}
        <FlatList data={manifest.folders[folder]?.entries || []} keyExtractor={entry => entry.path} ListEmptyComponent={<Text style={muted}>Keine Dokumente verfügbar. Lade diesen Ordner im Heim-WLAN.</Text>} renderItem={({ item }) => <TouchableOpacity accessibilityRole="button" onPress={() => {
          if (item.directory) selectFolder(item.path);
          else if (config) {
            if (!props.attachments.some(value => value.configId === config.id && value.path === item.path)) props.onAttachments([...props.attachments, { id: generateUUID(), configId: config.id, path: item.path, name: item.name }]);
            setPicking(false);
          }
        }} style={{ ...card, flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 8 }}><Ionicons name={item.directory ? 'folder-outline' : 'document-outline'} size={24} color={theme.accent} /><Text style={[text, { flex: 1 }]}>{item.name}</Text></TouchableOpacity>} />
      </View>
    </Modal>
  </>;
}
