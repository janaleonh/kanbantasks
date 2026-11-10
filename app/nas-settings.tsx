import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDocumentStore } from '../src/stores/useDocumentStore';
import { currentHomeNetwork } from '../src/documents/network';
import { DavError } from '../src/documents/webdav';
import type { NasInput } from '../src/documents/types';
import { useTheme } from '../src/hooks/useTheme';

export default function NasSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { config, saving, saveConfig, testConnection, disconnect, initialize } = useDocumentStore();
  const [input, setInput] = useState<NasInput>({ server: '', root: '/', username: '', homeNetwork: '', autoSync: true });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const running = useRef(false);
  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => { if (config && !dirty.current) setInput({ server: config.server, root: config.root, username: config.username, homeNetwork: config.homeNetwork, autoSync: config.autoSync }); }, [config]);
  const change = <K extends keyof NasInput>(key: K, value: NasInput[K]) => { dirty.current = true; setInput((current) => ({ ...current, [key]: value })); setNotice(null); };
  const save = async (test: boolean) => {
    if (running.current || saving) return;
    running.current = true; setBusy(true); setError(null); setNotice(null);
    let saved = false;
    try {
      await saveConfig(input, password); saved = true;
      dirty.current = false; setPassword('');
      setNotice(test ? await testConnection() : 'NAS-Einstellungen gespeichert. Der Abgleich erfolgt im hinterlegten Heim-WLAN.');
    } catch (err) {
      if(saved && err instanceof DavError && err.status && [401,403,404].includes(err.status)){
        setError('WebDAV erreichbar. ' + ({401:'Anmeldung abgelehnt. Prüfe den NAS-Benutzernamen und gib das Passwort erneut ein.',403:'Zugriff auf den Startordner verweigert. Prüfe die Leseberechtigung für den Benutzer in DSM.',404:'Startordner nicht gefunden. Übernimm den exakten Namen aus DSM → Freigegebener Ordner.'}[err.status]));
      } else setError(`${saved ? 'Einstellungen gespeichert. ' : ''}${err instanceof Error ? err.message : 'Die Verbindung konnte nicht gespeichert werden.'}`); }
    finally { running.current = false; setBusy(false); }
  };
  const remove = () => Alert.alert('NAS-Verbindung entfernen?', 'Die gespeicherten NAS-Zugangsdaten und alle lokalen NAS-Offlinekopien werden vom iPhone entfernt. Die Originaldateien auf deinem NAS bleiben erhalten.', [
    { text: 'Abbrechen', style: 'cancel' }, { text: 'Entfernen', style: 'destructive', onPress: () => {
      if (running.current || saving) return;
      running.current = true; setBusy(true);
      void disconnect().then(() => router.back()).catch((err) => setError(err instanceof Error ? err.message : 'Die Verbindung konnte nicht entfernt werden.')).finally(() => { running.current = false; setBusy(false); });
    } },
  ]);
  const field = (key: 'server' | 'username' | 'root' | 'homeNetwork', title: string, placeholder: string, hint?: string) => <View style={styles.field}>
    <Text style={[styles.label, { color: theme.text }]}>{title}</Text>
    <TextInput accessibilityLabel={title} value={input[key]} onChangeText={(value) => change(key, value)} autoCapitalize="none" autoCorrect={false} editable={!busy && !saving} placeholder={placeholder} placeholderTextColor={theme.subtext} keyboardType={key === 'server' ? 'url' : 'default'} style={[styles.input, { color: theme.text, backgroundColor: theme.cardBg, borderColor: theme.border }]} />
    {hint && <Text style={[styles.hint, { color: theme.subtext }]}>{hint}</Text>}
  </View>;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top + 56}>
    <Stack.Screen options={{ headerTitle: 'Synology NAS', gestureEnabled: !busy }} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={[styles.title, { color: theme.text, fontFamily: theme.headingFont }]}>Deine Dokumente. Auch unterwegs.</Text>
      <Text style={[styles.description, { color: theme.subtext }]}>Verbinde den WebDAV Server deines Synology NAS. Favoriten werden vom NAS auf dein iPhone geladen und stehen anschließend offline bereit.</Text>
      {field('server', 'NAS-Adresse (HTTPS)', 'https://nas.example.de:5006', 'Auf dem NAS muss „WebDAV Server“ mit HTTPS aktiviert sein. Das Zertifikat muss zur Adresse passen und auf dem iPhone gültig sein.')}
      {field('root', 'Startordner', '/home/Drive/Wichtig', '„/“ zeigt die freigegebenen Ordner deines Benutzers. Hier kannst du den Zugriff auf deinen Dokumentenordner begrenzen.')}
      {field('username', 'NAS-Benutzer', 'Dein Benutzername')}
      <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>Passwort</Text><TextInput accessibilityLabel="NAS-Passwort" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" value={password} onChangeText={(value) => { setPassword(value); dirty.current = true; }} editable={!busy && !saving} placeholder={config ? 'Leer lassen, um das gespeicherte Passwort zu behalten' : 'NAS-Passwort'} placeholderTextColor={theme.subtext} style={[styles.input, { color: theme.text, backgroundColor: theme.cardBg, borderColor: theme.border }]} /><Text style={[styles.hint, { color: theme.subtext }]}>Die Zugangsdaten werden in der geschützten Schlüsselablage des Geräts gespeichert.</Text></View>
      <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.columnRadius }]}>
        <Text style={[styles.label, { color: theme.text }]}>Nur zu Hause abgleichen</Text>
        <Text style={[styles.hint, { color: theme.subtext }]}>Verbinde dich mit deinem Heim-WLAN und übernimm seinen Netzbereich. Die NAS-Verbindung wird zusätzlich geprüft.</Text>
        <TouchableOpacity accessibilityRole="button" disabled={busy || saving} onPress={() => { void currentHomeNetwork().then((network) => change('homeNetwork', network)).catch((err) => setError(err.message)); }} style={[styles.secondary, { backgroundColor: theme.pillBg }]}><Text style={{ color: theme.accent, fontWeight: '600' }}>Dieses WLAN als Heimnetz übernehmen</Text></TouchableOpacity>
        {field('homeNetwork', 'Heimnetzbereich (IPv4/CIDR)', '192.168.178.0/24', 'Du kannst den erkannten Bereich bei Bedarf anpassen. Ohne erkennbares Heimnetz werden keine Dokumente vom NAS geladen.')}
        <View style={styles.switchRow}><Text style={[styles.switchText, { color: theme.text }]}>Automatisch zu Hause abgleichen</Text><Switch accessibilityLabel="Automatischer NAS-Abgleich" disabled={busy || saving} value={input.autoSync} onValueChange={(value) => change('autoSync', value)} trackColor={{ true: theme.accent }} /></View>
        <Text style={[styles.hint, { color: theme.subtext }]}>Beim Öffnen der App und während der Nutzung im Heim-WLAN. Du kannst den Abgleich im Dokumentenbereich auch selbst starten.</Text>
      </View>
      {!!error && <Text accessibilityRole="alert" style={[styles.description, { color: theme.isDark ? '#FFA79E' : '#B42318' }]}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={[styles.description, { color: theme.accent }]}>{notice}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={busy || saving} onPress={() => { void save(true); }} style={[styles.primary, { backgroundColor: theme.accent, opacity: busy || saving ? 0.5 : 1 }]}>{busy || saving ? <ActivityIndicator color={theme.onAccent ?? '#FFFFFF'} /> : <Text style={{ color: theme.onAccent ?? '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Speichern & Verbindung prüfen</Text>}</TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy || saving} onPress={() => { void save(false); }} style={styles.secondary}><Text style={{ color: theme.accent, fontWeight: '600' }}>Nur speichern</Text></TouchableOpacity>
      <Text style={[styles.description, { color: theme.subtext }]}>Offline-Favoriten: bis 50 MB pro Datei, 500 MB insgesamt und 200 Dateien pro Abgleich. Ordnerfavoriten enthalten auch Unterordner. Auf dem NAS gelöschte Dateien bleiben als gekennzeichnete Offlinekopie erhalten.</Text>
      {config && <TouchableOpacity accessibilityRole="button" disabled={busy || saving} onPress={remove} style={styles.secondary}><Text style={{ color: theme.isDark ? '#FFA79E' : '#B42318' }}>Verbindung und Offlinekopien entfernen</Text></TouchableOpacity>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  content: { padding: 20 }, title: { fontSize: 26, lineHeight: 33, fontWeight: '700', letterSpacing: -0.6, marginBottom: 10 },
  description: { fontSize: 13, lineHeight: 21, marginBottom: 20 }, field: { marginBottom: 19 }, label: { fontSize: 14, fontWeight: '600', marginBottom: 9 },
  input: { padding: 13, fontSize: 14, borderWidth: 1, borderRadius: 12 }, hint: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  group: { borderWidth: 1, padding: 15, marginBottom: 22 }, primary: { padding: 16, borderRadius: 13, alignItems: 'center' },
  secondary: { padding: 13, borderRadius: 10, alignItems: 'center', marginVertical: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, switchText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
