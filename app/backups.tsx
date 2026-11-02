import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useTheme } from '../src/hooks/useTheme';
import { useBackupStore } from '../src/stores/useBackupStore';
import { useDocumentStore } from '../src/stores/useDocumentStore';
import { MAX_BACKUP_BYTES, type BackupData } from '../src/backup/format';

export default function BackupsScreen() {
  const theme = useTheme(), backup = useBackupStore();
  const { config, home } = useDocumentStore();
  const [reading, setReading] = useState(false), [preview, setPreview] = useState<BackupData | null>(null);
  const error = (err: unknown) => Alert.alert('Sicherungen', err instanceof Error ? err.message : 'Die Aktion ist fehlgeschlagen.');
  useEffect(() => { void backup.initialize().catch(error); if (config && home) void backup.refreshFiles().catch(() => {}); }, [config?.id, home, backup.initialize, backup.refreshFiles]);
  const read = async (path: string) => { setReading(true); try { setPreview(await backup.read(path)); } catch (err) { error(err); } finally { setReading(false); } };
  const local = async () => {
    setReading(true); let file: File | null = null;
    try {
      const selected = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], multiple: false, copyToCacheDirectory: true });
      if (selected.canceled) return;
      const uri = selected.assets[0].uri;
      if (!uri.startsWith(`${Paths.cache.uri.replace(/\/$/, '')}/`) || /(?:^|\/)\.\.(?:\/|$)/.test(decodeURIComponent(uri))) throw new Error('Die ausgewählte Datei konnte nicht sicher gelesen werden.');
      file = new File(uri);
      if (!file.exists || file.size > MAX_BACKUP_BYTES) throw new Error('Die Sicherung ist nicht verfügbar oder größer als 10 MB.');
      setPreview(await backup.parse(await file.text()));
    } catch (err) { error(err); }
    finally { try { if (file?.exists) file.delete(); } catch {} setReading(false); }
  };
  const restore = () => {
    if (!preview) return;
    Alert.alert('Sicherung als neue Listen übernehmen?', `${preview.lists.length} Listen und ${preview.tasks.length} Aufgaben werden zusätzlich angelegt. Vorhandene Aufgaben bleiben erhalten. Neue Listen werden anschließend mit dem zugehörigen Google-Konto synchronisiert.`, [
      { text: 'Abbrechen', style: 'cancel' }, { text: 'Wiederherstellen', onPress: () => { void backup.restore(preview).then(() => { setPreview(null); Alert.alert('Wiederhergestellt', 'Die zusätzlichen Listen findest du auf dem Board.'); }).catch(error); } },
    ]);
  };
  const button = (label: string, action: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" disabled={disabled || backup.busy || reading} onPress={action} style={{ padding: 14, backgroundColor: theme.pillBg, borderRadius: 12, marginTop: 12, opacity: disabled || backup.busy || reading ? 0.5 : 1 }}><Text style={{ color: theme.accent, fontWeight: '600', textAlign: 'center' }}>{label}</Text></TouchableOpacity>;
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}><Stack.Screen options={{ headerShown: true, headerTitle: 'Sicherungen' }} />
    <View style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1, padding: 17, borderRadius: theme.cardRadius }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: theme.text, flex: 1, fontWeight: '600' }}>Automatisch auf dem NAS sichern</Text><Switch value={backup.automatic} disabled={!backup.initialized || backup.busy} onValueChange={enabled => { void backup.setAutomatic(enabled).catch(error); }} /></View>
      <Text style={{ color: theme.subtext, lineHeight: 20, fontSize: 13, marginTop: 12 }}>Einmal täglich bei geöffneter, entsperrter App im Heim-WLAN. Enthält Aufgaben, Checklisten, Wiederholungen, Projekte, Tags und Dokumentverknüpfungen. Kalender, Passwörter und Dokumentdateien werden nicht kopiert.</Text>
      <Text style={{ color: theme.subtext, lineHeight: 20, fontSize: 13, marginTop: 10 }}>Ziel: {config ? `${config.root.replace(/\/$/, '')}/Planner-Backups` : 'Zuerst ein NAS verbinden'}. Sicherungen werden als neue JSON-Dateien gespeichert und zur Prüfung zurückgelesen. Sie sind auf dem NAS nicht zusätzlich verschlüsselt.</Text>
      {backup.lastAt && <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 10 }}>Letzte bestätigte Sicherung: {new Date(backup.lastAt).toLocaleString('de-DE')}</Text>}
      {!!backup.error && <Text accessibilityRole="alert" style={{ color: theme.subtext, marginTop: 12 }}>{backup.error}</Text>}
      {button('Jetzt auf dem NAS sichern', () => { void backup.createBackup().then(() => backup.refreshFiles()).catch(error); }, !config || !home)}
      {button('Sicherungen vom NAS laden', () => { void backup.refreshFiles().catch(error); }, !config || !home)}
      {button('Sicherungsdatei vom iPhone öffnen', () => { void local(); })}
      {(backup.busy || reading) && <ActivityIndicator color={theme.accent} style={{ marginTop: 15 }} />}
    </View>
    {preview && <View style={{ padding: 17, marginTop: 20, backgroundColor: theme.cardBg, borderRadius: theme.cardRadius, gap: 10 }}><Text style={{ color: theme.text, fontWeight: '700' }}>Sicherung geprüft</Text><Text style={{ color: theme.subtext }}>{new Date(preview.createdAt).toLocaleString('de-DE')} · {preview.lists.length} Listen · {preview.tasks.length} Aufgaben</Text><Text style={{ color: theme.subtext }}>Konto: {preview.owner || 'Lokale Aufgaben'}</Text>{button('Als neue Listen wiederherstellen', restore)}{button('Vorschau schließen', () => setPreview(null))}</View>}
    {backup.files.length > 0 && <Text style={{ color: theme.subtext, marginTop: 22, marginBottom: 12 }}>SICHERUNGEN AUF DEM NAS · {backup.files.length}</Text>}
    {backup.files.map(file => <TouchableOpacity key={file.path} disabled={reading || backup.busy || !home} onPress={() => { void read(file.path); }} style={{ padding: 15, marginBottom: 10, backgroundColor: theme.cardBg, borderRadius: theme.cardRadius }}><Text numberOfLines={2} style={{ color: theme.text }}>{file.name}</Text><Text style={{ color: theme.subtext, marginTop: 5, fontSize: 12 }}>{file.modified ? new Date(file.modified).toLocaleString('de-DE') : 'Zur Vorschau öffnen'}</Text></TouchableOpacity>)}
  </ScrollView>;
}
