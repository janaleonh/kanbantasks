import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDocumentStore } from '../src/stores/useDocumentStore';
import type { DavEntry } from '../src/documents/types';
import { formatBytes } from '../src/documents/paths';
import { useTheme } from '../src/hooks/useTheme';
import { getTaskById } from '../src/db/taskRepo';

type Lease = Awaited<ReturnType<ReturnType<typeof useDocumentStore.getState>['openFile']>>;

export default function DocumentScreen() {
  const { path, taskId } = useLocalSearchParams<{ path: string; taskId?: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const configId = useDocumentStore((state) => state.config?.id);
  const initialized = useDocumentStore((state) => state.initialized);
  const [entry, setEntry] = useState<DavEntry | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [kind, setKind] = useState<'pdf' | 'image' | 'text' | 'other'>('other');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lease = useRef<Lease | null>(null);
  useEffect(() => {
    if (!initialized) return;
    let closed = false;
    let current: Lease | null = null;
    setLoading(true); setError(null); setUri(null); setKind('other');
    void (async () => {
      try {
        const state = useDocumentStore.getState();
        const favorite = state.manifest.favorites.find((favorite) => favorite.path === path && !favorite.directory);
        let found = state.manifest.offline[path]?.entry || Object.values(state.manifest.folders).flatMap((folder) => folder.entries).find((entry) => entry.path === path && !entry.directory) || (favorite ? { ...favorite, size: null, modified: null, etag: null, mimeType: 'application/octet-stream' } : null);
        if (!found && taskId && state.config) {
          const task = await getTaskById(taskId);
          const attached = !task?.deletedLocally && task?.attachments?.find(attachment => attachment.configId === state.config!.id && attachment.path === path);
          if (attached && !closed) found = await state.getRemoteEntry(path, attached.configId);
        }
        if (!state.config || !found) throw new Error('Dieses Dokument ist nicht mehr in deiner Dokumentenliste. Bitte öffne es erneut über den Explorer.');
        if (closed) return;
        setEntry(found);
        current = await state.openFile(found);
        if (closed) { current.release(); return; }
        lease.current = current; setUri(current.uri);
        const file = new File(current.uri);
        const extension = found.name.split('.').pop()?.toLowerCase() || '';
        if (extension === 'pdf' || found.mimeType === 'application/pdf') {
          const reader = file.readableStream().getReader();
          try {
            const first = await reader.read();
            const bytes = first.value;
            if (bytes && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70 && bytes[4] === 45 && Platform.OS === 'ios' && !closed) setKind('pdf');
          } finally { await reader.cancel().catch(() => {}); }
        } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp'].includes(extension)) { if (!closed) setKind('image'); }
        else if (['txt', 'md', 'csv', 'json', 'log'].includes(extension) && file.size <= 1024 * 1024) {
          const content = await file.text();
          if (!closed) { setText(content); setKind('text'); }
        }
      } catch (err) { if (!closed) setError(err instanceof Error ? err.message : 'Das Dokument konnte nicht geöffnet werden.'); }
      finally { if (!closed) setLoading(false); }
    })();
    return () => { closed = true; current?.release(); if (lease.current === current) lease.current = null; };
  }, [path, taskId, configId, initialized]);
  const share = async () => {
    if (!uri || sharing || !lease.current) return;
    let release: (() => void) | undefined;
    setSharing(true);
    try {
      release = lease.current.retain();
      if (!await Sharing.isAvailableAsync()) throw new Error('Auf diesem Gerät ist kein Teilen-Menü verfügbar.');
      await Sharing.shareAsync(uri, { dialogTitle: entry?.name, ...(entry?.mimeType !== 'application/octet-stream' ? { mimeType: entry?.mimeType } : {}) });
    } catch (err) { Alert.alert('Dokument konnte nicht geöffnet werden', err instanceof Error ? err.message : 'Bitte versuche es erneut.'); }
    finally { release?.(); setSharing(false); }
  };
  const sameLocalFile = (url: string) => {
    try { return !!uri && decodeURIComponent(url) === decodeURIComponent(uri); } catch { return false; }
  };
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ headerTitle: entry?.name || 'Dokument' }} />
    {loading ? <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /><Text style={[styles.description, { color: theme.subtext }]}>Dokument wird geöffnet …</Text></View> : error ? <View style={styles.center}><Ionicons name="document-outline" size={40} color={theme.accent} /><Text accessibilityRole="alert" style={[styles.description, { color: theme.text }]}>{error}</Text></View> : uri && kind === 'pdf' ? <WebView source={{ uri }} style={{ flex: 1, backgroundColor: theme.background }} originWhitelist={['file://*']} allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf('/') + 1)} javaScriptEnabled={false} domStorageEnabled={false} sharedCookiesEnabled={false} allowUniversalAccessFromFileURLs={false} onShouldStartLoadWithRequest={(request) => sameLocalFile(request.url) || request.url === 'about:blank'} onError={() => { setKind('other'); }} /> : uri && kind === 'image' ? <Image accessibilityLabel={entry?.name} source={{ uri }} style={{ flex: 1 }} resizeMode="contain" onError={() => setKind('other')} /> : kind === 'text' ? <ScrollView contentContainerStyle={styles.textContent}><Text selectable style={[styles.text, { color: theme.text }]}>{text}</Text></ScrollView> : <View style={styles.center}><Ionicons name="document-text-outline" size={48} color={theme.accent} /><Text style={[styles.name, { color: theme.text }]}>{entry?.name}</Text><Text style={[styles.description, { color: theme.subtext }]}>Öffne dieses Dokument in einer passenden App oder sichere eine Kopie über das Teilen-Menü.</Text></View>}
    {!!uri && !loading && <View style={[styles.footer, { borderTopColor: theme.border, paddingBottom: insets.bottom + 12 }]}>
      <Text style={[styles.detail, { color: theme.subtext }]}>{entry?.name} · {formatBytes(entry?.size ?? null)}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={sharing} onPress={() => { void share(); }} style={[styles.button, { backgroundColor: theme.accent }]}>{sharing ? <ActivityIndicator color={theme.onAccent ?? '#FFFFFF'} /> : <Ionicons name="share-outline" size={20} color={theme.onAccent ?? '#FFFFFF'} />}<Text style={{ color: theme.onAccent ?? '#FFFFFF', fontWeight: '700' }}>Öffnen / Teilen</Text></TouchableOpacity>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 18 }, description: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  name: { fontSize: 20, fontWeight: '700', textAlign: 'center' }, footer: { padding: 16, borderTopWidth: 1, gap: 10 }, detail: { fontSize: 11, lineHeight: 17 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 14, borderRadius: 12 },
  textContent: { padding: 20 }, text: { fontSize: 14, lineHeight: 23, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
