import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../src/hooks/useTheme';
import { useKanbanStore } from '../src/stores/useKanbanStore';
import { captureTask } from '../src/db/taskRepo';
import { sharedDraft } from '../src/tasks/capture';

export default function CaptureScreen() {
  const { source } = useLocalSearchParams<{ source?: string }>();
  const theme = useTheme(), router = useRouter();
  const { taskLists, loadAll, scheduleSync } = useKanbanStore();
  const [title, setTitle] = useState(''), [notes, setNotes] = useState(''), [listId, setListId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState<string | null>(null);
  const receipt = useRef(Crypto.randomUUID());
  const saving = useRef(false);
  useEffect(() => {
    let canceled = false;
    void (async () => {
      try {
        await loadAll();
        if (source === 'share') {
          const payloads = Sharing.getSharedPayloads();
          const draft = sharedDraft(payloads);
          // Persist a receipt for a pending share so a crash after save cannot duplicate it.
          const fingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(payloads));
          const saved = await SecureStore.getItemAsync('planner_pending_share');
          const previous = saved ? JSON.parse(saved) : null;
          const id = previous?.fingerprint === fingerprint && typeof previous.id === 'string' ? previous.id : Crypto.randomUUID();
          await SecureStore.setItemAsync('planner_pending_share', JSON.stringify({ fingerprint, id }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
          if (!canceled) { receipt.current = id; setTitle(draft.title); setNotes(draft.notes); }
        }
        if (!canceled) setReady(true);
      } catch (err) { if (!canceled) setError(err instanceof Error ? err.message : 'Die Schnellerfassung konnte nicht geöffnet werden.'); }
    })();
    return () => { canceled = true; };
  }, [source, loadAll]);
  const clearShare = async () => {
    if (source === 'share') { Sharing.clearSharedPayloads(); await SecureStore.deleteItemAsync('planner_pending_share'); }
  };
  const save = async () => {
    if (!ready || !title.trim() || saving.current) return;
    saving.current = true; setBusy(true);
    let saved = false;
    try {
      await captureTask(title, notes, listId, `capture:${receipt.current}`);
      saved = true;
      await clearShare(); await loadAll(); scheduleSync(); router.replace('/');
    } catch (err) { Alert.alert(saved ? 'Aufgabe gespeichert' : 'Aufgabe nicht gespeichert', saved ? 'Die Aufgabe ist gespeichert. Der Abschluss der Schnellerfassung hat nicht funktioniert; bei erneutem Speichern wird keine zweite Aufgabe angelegt.' : err instanceof Error ? err.message : 'Bitte versuche es erneut.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Stack.Screen options={{ headerShown: true, headerTitle: 'Neue Aufgabe' }} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 18 }}>
      {!!error && <Text accessibilityRole="alert" style={{ color: theme.text }}>{error}</Text>}
      {!ready && !error && <ActivityIndicator color={theme.accent} />}
      <TextInput accessibilityLabel="Aufgabentitel" placeholder="Was möchtest du erledigen?" placeholderTextColor={theme.subtext} maxLength={1000} value={title} onChangeText={setTitle} editable={ready && !busy} style={{ padding: 16, fontSize: 20, fontWeight: '600', color: theme.text, backgroundColor: theme.cardBg, borderRadius: 14 }} />
      <TextInput accessibilityLabel="Notizen zur Aufgabe" placeholder="Notiz oder Link" placeholderTextColor={theme.subtext} multiline maxLength={20000} value={notes} onChangeText={setNotes} editable={ready && !busy} style={{ padding: 16, minHeight: 140, textAlignVertical: 'top', color: theme.text, backgroundColor: theme.cardBg, borderRadius: 14 }} />
      <Text style={{ color: theme.subtext }}>LISTE</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
        {[{ id: null, title: 'Erste sichtbare Liste / Eingang' }, ...taskLists].map(list => <TouchableOpacity accessibilityRole="button" key={list.id || 'default'} disabled={busy} onPress={() => setListId(list.id)} style={{ padding: 12, borderRadius: 10, backgroundColor: listId === list.id ? theme.accent : theme.cardBg }}><Text style={{ color: listId === list.id ? theme.onAccent ?? '#fff' : theme.text }}>{list.title}</Text></TouchableOpacity>)}
      </View>
      <TouchableOpacity accessibilityRole="button" disabled={!ready || !title.trim() || busy} onPress={() => { void save(); }} style={{ backgroundColor: theme.accent, borderRadius: 14, padding: 16, alignItems: 'center', opacity: !ready || !title.trim() || busy ? 0.5 : 1 }}>{busy ? <ActivityIndicator color={theme.onAccent ?? '#fff'} /> : <Text style={{ fontWeight: '700', color: theme.onAccent ?? '#fff' }}>Aufgabe speichern</Text>}</TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { void clearShare().then(() => router.back()); }} style={{ padding: 14, alignItems: 'center' }}><Text style={{ color: theme.subtext }}>Verwerfen</Text></TouchableOpacity>
    </ScrollView>
  </KeyboardAvoidingView>;
}
