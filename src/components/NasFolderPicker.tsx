import React, { useState } from 'react';
import { FlatList, Modal, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useDocumentStore } from '../stores/useDocumentStore';

export function NasFolderPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (path: string) => void }) {
  const theme = useTheme(), insets = useSafeAreaInsets(), [path, setPath] = useState('');
  const { config, manifest, browse, folderError } = useDocumentStore();
  const open = (value: string) => { setPath(value); void browse(value); };
  return <Modal visible={visible} onShow={() => open('')} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 20, paddingTop: insets.top + 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}><Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>Zielordner</Text><TouchableOpacity onPress={onClose}><Text style={{ color: theme.accent }}>Schließen</Text></TouchableOpacity></View>
      <Text style={{ color: theme.subtext, marginBottom: 14 }}>{config?.root}/{path}</Text>
      {!!path && <TouchableOpacity onPress={() => open(path.split('/').slice(0, -1).join('/'))} style={{ paddingVertical: 12 }}><Text style={{ color: theme.accent }}>‹ Eine Ebene zurück</Text></TouchableOpacity>}
      {!!folderError && <Text style={{ color: theme.subtext, marginBottom: 14 }}>{folderError}</Text>}
      <FlatList data={(manifest.folders[path]?.entries || []).filter(entry => entry.directory)} keyExtractor={entry => entry.path} renderItem={({ item }) => <TouchableOpacity onPress={() => open(item.path)} style={{ padding: 16, marginBottom: 8, borderRadius: theme.cardRadius, backgroundColor: theme.cardBg }}><Text style={{ color: theme.text }}>📁 {item.name}</Text></TouchableOpacity>} />
      <TouchableOpacity disabled={!config || !!folderError} onPress={() => { onSelect(path); onClose(); }} style={{ padding: 16, marginBottom: insets.bottom, borderRadius: 12, backgroundColor: theme.accent }}><Text style={{ color: theme.onAccent ?? '#fff', fontWeight: '700', textAlign: 'center' }}>Diesen Ordner verwenden</Text></TouchableOpacity>
    </View>
  </Modal>;
}
