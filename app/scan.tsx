import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { useTheme } from '../src/hooks/useTheme';
import { useDocumentStore } from '../src/stores/useDocumentStore';
import { scanDocument, getScans, scanFile, renameScan, deleteScan, type ScanRecord } from '../src/documents/scans';
import { NasFolderPicker } from '../src/components/NasFolderPicker';

export default function ScanScreen() {
  const theme = useTheme();
  const { config, home, uploadFile } = useDocumentStore();
  const [scans, setScans] = useState<ScanRecord[]>([]), [selected, setSelected] = useState<ScanRecord | null>(null), [name, setName] = useState(''), [busy, setBusy] = useState(false), [preview, setPreview] = useState(false), [folderPicker, setFolderPicker] = useState(false), [folder, setFolder] = useState('');
  const fail = (error: unknown) => Alert.alert('Dokumentenscan', error instanceof Error ? error.message : 'Die Aktion konnte nicht abgeschlossen werden.');
  const load = () => getScans().then(setScans);
  useEffect(() => { void load().catch(fail); }, []);
  const choose = (scan: ScanRecord) => { setSelected(scan); setName(scan.name); setPreview(false); };
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); try { await action(); } catch (error) { fail(error); } finally { setBusy(false); } };
  const scan = () => run(async () => { const result = await scanDocument(); if (result) { await load(); choose(result); } });
  const upload = () => run(async () => {
    if (!selected || !config) throw new Error('Wähle zuerst einen Scan und verbinde dein NAS.');
    await renameScan(selected.id, name);
    const updated = (await getScans()).find(value => value.id === selected.id)!;
    const file = scanFile(selected.id);
    await uploadFile(folder, { name: updated.name, body: file, size: file.size }, config.id);
    await load(); choose(updated);
    Alert.alert('Auf dem NAS gespeichert', 'Die lokale Kopie bleibt erhalten. Du kannst sie unten ausdrücklich entfernen.');
  });
  const button = (label: string, action: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" disabled={busy || disabled} onPress={action} style={{ padding: 14, backgroundColor: theme.pillBg, borderRadius: 12, marginBottom: 10, opacity: busy || disabled ? 0.5 : 1 }}><Text style={{ color: theme.accent, fontWeight: '600', textAlign: 'center' }}>{label}</Text></TouchableOpacity>;
  const uri = selected ? scanFile(selected.id).uri : null;
  if (preview && uri) return <View style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ headerShown: true, headerTitle: selected?.name }} />{button('Vorschau schließen', () => setPreview(false))}<WebView source={{ uri }} style={{ flex: 1 }} javaScriptEnabled={false} domStorageEnabled={false} sharedCookiesEnabled={false} allowUniversalAccessFromFileURLs={false} originWhitelist={['file://*']} allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf('/') + 1)} onShouldStartLoadWithRequest={request => { try { return decodeURIComponent(request.url) === decodeURIComponent(uri) || request.url === 'about:blank'; } catch { return false; } }} /></View>;
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}><Stack.Screen options={{ headerShown: true, headerTitle: 'Dokumente scannen' }} />
    <Text style={{ color: theme.subtext, lineHeight: 21, marginBottom: 16 }}>Scanne bis zu 20 Seiten als PDF. Scans bleiben lokal erhalten, auch wenn du noch nicht zu Hause bist. Für den Upload werden dein Heim-WLAN und NAS-Schreibrechte benötigt.</Text>
    {button('Neues Dokument scannen', () => { void scan(); })}
    {busy && <ActivityIndicator color={theme.accent} style={{ marginBottom: 16 }} />}
    {selected && <View style={{ padding: 16, backgroundColor: theme.cardBg, borderRadius: theme.cardRadius, marginBottom: 22 }}>
      <Text style={{ color: theme.subtext, marginBottom: 10 }}>{selected.pages} Seiten · {(selected.size / 1024 / 1024).toFixed(1)} MB</Text>
      <TextInput accessibilityLabel="PDF-Dateiname" value={name} onChangeText={setName} maxLength={180} editable={!busy} style={{ color: theme.text, backgroundColor: theme.inputBg, padding: 13, borderRadius: 10, marginBottom: 12 }} />
      {button('PDF-Vorschau', () => setPreview(true))}
      {button('In Dateien sichern / teilen', () => { void run(async () => { await renameScan(selected.id, name); if (!await Sharing.isAvailableAsync()) throw new Error('Das Teilen-Menü ist nicht verfügbar.'); await Sharing.shareAsync(scanFile(selected.id).uri, { mimeType: 'application/pdf', dialogTitle: name }); await load(); }); })}
      <Text style={{ color: theme.subtext, fontSize: 12, marginVertical: 12 }}>NAS-Ziel: {config?.root || 'Nicht verbunden'}/{folder}</Text>
      {button('NAS-Zielordner wählen', () => setFolderPicker(true), !config)}
      {button('PDF aufs NAS hochladen', () => { void upload(); }, !config || !home)}
      {button('Lokale Kopie löschen', () => Alert.alert('Lokalen Scan löschen?', 'Die PDF auf diesem iPhone wird gelöscht. Eine bereits hochgeladene NAS-Kopie bleibt erhalten.', [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: () => { void run(async () => { await deleteScan(selected.id); setSelected(null); await load(); }); } }]))}
    </View>}
    <Text style={{ color: theme.subtext, marginBottom: 12 }}>LOKALE SCANS · {scans.length}</Text>
    {scans.map(scan => <TouchableOpacity key={scan.id} disabled={busy} onPress={() => choose(scan)} style={{ padding: 15, marginBottom: 8, backgroundColor: theme.cardBg, borderRadius: theme.cardRadius }}><Text style={{ color: theme.text }}>{scan.name}</Text><Text style={{ color: theme.subtext, fontSize: 12, marginTop: 5 }}>{new Date(scan.createdAt).toLocaleString('de-DE')} · {scan.pages} Seiten</Text></TouchableOpacity>)}
    <NasFolderPicker visible={folderPicker} onClose={() => setFolderPicker(false)} onSelect={setFolder} />
  </ScrollView>;
}
