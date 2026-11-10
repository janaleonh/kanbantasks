import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { enqueueScan, useScanRevision } from '../src/documents/scanOutbox';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { useTheme } from '../src/hooks/useTheme';
import { useDocumentStore } from '../src/stores/useDocumentStore';
import { scanDocument, getScans, scanFile, renameScan, deleteScan, type ScanRecord } from '../src/documents/scans';
import { NasFolderPicker } from '../src/components/NasFolderPicker';

export default function ScanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{id?: string}>();
  const revision = useScanRevision(s => s.revision);
  const { config, home } = useDocumentStore();
  const [scans, setScans] = useState<ScanRecord[]>([]), [selected, setSelected] = useState<ScanRecord | null>(null), [name, setName] = useState(''), [busy, setBusy] = useState(false), [preview, setPreview] = useState(false), [folderPicker, setFolderPicker] = useState(false), [folder, setFolder] = useState('');
  const fail = (error: unknown) => Alert.alert('Dokumentenscan', error instanceof Error ? error.message : 'Die Aktion konnte nicht abgeschlossen werden.');
  const load = () => getScans().then(setScans);
  useEffect(() => { let active = true; void getScans().then(rows => { if (active) setScans(rows); }).catch(fail); return () => { active = false; }; }, [revision]);
  useEffect(() => { let active = true; if (id) void getScans().then(rows => { const row = rows.find(s => s.id === id); if (active && row) choose(row); }).catch(fail); return () => { active = false; }; }, [id]);
  const choose = (scan: ScanRecord) => { setSelected(scan); setName(scan.name); setFolder(scan.folder ?? ''); setPreview(false); };
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); try { await action(); } catch (error) { fail(error); } finally { setBusy(false); } };
  const scan = () => run(async () => { const result = await scanDocument(); if (result) {
    useScanRevision.setState({recentScanId:result.id});
    router.dismissTo({pathname:'/',params:{tab:'documents'}});
  } });
  const upload = () => run(async () => {
    if (!selected || !config) throw new Error('Wähle zuerst einen Scan und verbinde dein NAS.');
    await renameScan(selected.id, name);
    const updated = (await getScans()).find(value => value.id === selected.id)!;
    await enqueueScan(updated, folder, config.id);
    await load(); choose(updated);

  });
  const button = (label: string, action: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" disabled={busy || disabled} onPress={action} style={{ padding: 14, backgroundColor: theme.pillBg, borderRadius: 12, marginBottom: 10, opacity: busy || disabled ? 0.5 : 1 }}><Text style={{ color: theme.accent, fontWeight: '600', textAlign: 'center' }}>{label}</Text></TouchableOpacity>;
  const status = (scan: ScanRecord) => ({ waiting: 'Wartet auf NAS', sending: 'Wird hochgeladen', confirmed: 'Auf NAS bestätigt', conflict: 'Ziel prüfen' }[scan.state ?? ''] || 'Nur auf dem iPhone');
  const current = scans.find(scan => scan.id === selected?.id);
  const uri = selected ? scanFile(selected.id).uri : null;
  if (preview && uri) return <View style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ headerShown: true, headerTitle: selected?.name }} />{button('Vorschau schließen', () => setPreview(false))}<WebView source={{ uri }} style={{ flex: 1 }} javaScriptEnabled={false} domStorageEnabled={false} sharedCookiesEnabled={false} allowUniversalAccessFromFileURLs={false} originWhitelist={['file://*']} allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf('/') + 1)} onShouldStartLoadWithRequest={request => { try { return decodeURIComponent(request.url) === decodeURIComponent(uri) || request.url === 'about:blank'; } catch { return false; } }} /></View>;
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}><Stack.Screen options={{ headerShown: true, headerTitle: 'Dokumente scannen' }} />
    <Text style={{ color: theme.subtext, lineHeight: 21, marginBottom: 16 }}>Scanne bis zu 20 Seiten als PDF. Scans bleiben lokal erhalten, auch wenn du noch nicht zu Hause bist. Für den Upload werden dein Heim-WLAN und NAS-Schreibrechte benötigt.</Text>
    {button('Neues Dokument scannen', () => { void scan(); })}
    {busy && <ActivityIndicator color={theme.accent} style={{ marginBottom: 16 }} />}
    {selected && <View style={{ padding: 16, backgroundColor: theme.cardBg, borderRadius: theme.cardRadius, marginBottom: 22 }}>
      <Text style={{ color: theme.subtext, marginBottom: 10 }}>{selected.pages} Seiten · {(selected.size / 1024 / 1024).toFixed(1)} MB</Text>
      <TextInput accessibilityLabel="PDF-Dateiname" value={name} onChangeText={setName} maxLength={180} editable={!busy} style={{ color: theme.text, backgroundColor: theme.inputBg, padding: 13, borderRadius: 10, marginBottom: 12 }} />
      {current && <Text accessibilityLiveRegion="polite" style={{ color: theme.subtext, marginBottom: 12 }}>{[status(current), current.filename && [current.folder,current.filename].filter(Boolean).join('/'), current.error].filter(Boolean).join(' · ')}</Text>}
      {button('Aufgabe aus Scan erstellen', () => router.push({ pathname: '/capture', params: { scanId: selected.id } }))}
      {button('PDF-Vorschau', () => setPreview(true))}
      {button('In Dateien sichern / teilen', () => { void run(async () => { await renameScan(selected.id, name); if (!await Sharing.isAvailableAsync()) throw new Error('Das Teilen-Menü ist nicht verfügbar.'); await Sharing.shareAsync(scanFile(selected.id).uri, { mimeType: 'application/pdf', dialogTitle: name }); await load(); }); })}
      <Text style={{ color: theme.subtext, fontSize: 12, marginVertical: 12 }}>NAS-Ziel: {config?.root || 'Nicht verbunden'}/{folder}</Text>
      {button('NAS-Zielordner wählen', () => setFolderPicker(true), !config)}
      {button(home ? 'Upload einplanen' : 'Für Heim-WLAN vormerken', () => { void upload(); }, !config || current?.state === 'sending' || (current?.state === 'confirmed' && current.folder === folder && current.filename === name.trim()))}
      {button('Lokale Kopie löschen', () => Alert.alert('Lokalen Scan löschen?', 'Die PDF auf diesem iPhone wird gelöscht. Eine bereits hochgeladene NAS-Kopie bleibt erhalten.', [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: () => { void run(async () => { await deleteScan(selected.id); setSelected(null); await load(); }); } }]))}
    </View>}
    <Text style={{ color: theme.subtext, marginBottom: 12 }}>LOKALE SCANS · {scans.length}</Text>
    {scans.map(scan => <TouchableOpacity key={scan.id} disabled={busy} onPress={() => choose(scan)} style={{ padding: 15, marginBottom: 8, backgroundColor: theme.cardBg, borderRadius: theme.cardRadius }}><Text style={{ color: theme.text }}>{scan.name}</Text><Text style={{ color: theme.subtext, fontSize: 12, marginTop: 5 }}>{new Date(scan.createdAt).toLocaleString('de-DE')} · {scan.pages} Seiten · {status(scan)}</Text></TouchableOpacity>)}
    <NasFolderPicker allowCached visible={folderPicker} onClose={() => setFolderPicker(false)} onSelect={setFolder} />
  </ScrollView>;
}
