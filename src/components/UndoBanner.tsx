import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { restoreHistory, useUndoState } from '../db/history';
import { useKanbanStore } from '../stores/useKanbanStore';
import { useTheme } from '../hooks/useTheme';

export function UndoBanner() {
  const { last } = useUndoState(), theme = useTheme();
  const [busy, setBusy] = useState(false);
  if (!last) return null;
  const undo = async () => {
    if (busy) return; setBusy(true);
    try { await restoreHistory(last.id); await useKanbanStore.getState().loadAll(); useKanbanStore.getState().scheduleSync(); }
    catch (error) { Alert.alert('Rückgängig', error instanceof Error ? error.message : 'Der alte Stand konnte nicht wiederhergestellt werden.'); }
    finally { setBusy(false); }
  };
  return <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, padding: 12, borderRadius: 12, marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
    <Text style={{ color: theme.text, flex: 1, fontSize: 12 }}>{last.label}</Text>
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { void undo(); }}><Text style={{ color: theme.accent, fontWeight: '700' }}>{busy ? '…' : 'Rückgängig'}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Hinweis schließen" onPress={() => useUndoState.setState({ last: null })}><Text style={{ color: theme.subtext }}>✕</Text></TouchableOpacity>
  </View>;
}
