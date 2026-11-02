import React from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { usePrivacyStore } from '../stores/usePrivacyStore';
import { useTheme } from '../hooks/useTheme';
import { redactExistingNotifications } from '../services/notifications';

export function PrivacyPreferences() {
  const theme = useTheme();
  const privacy = usePrivacyStore();
  const changeLock = async (enabled: boolean) => { try { await privacy.setEnabled(enabled); } catch (err) { Alert.alert('App-Sperre', err instanceof Error ? err.message : 'Die Einstellung konnte nicht gespeichert werden.'); } };
  const changeText = async (hide: boolean) => {
    try { await privacy.setHideNotificationText(hide); if (hide) await redactExistingNotifications(); }
    catch { Alert.alert('Mitteilungen', 'Die Einstellung wurde möglicherweise gespeichert. Bitte prüfe bereits geplante Erinnerungen in den iPhone-Mitteilungen.'); }
  };
  return <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border, borderRadius: theme.cardRadius }]}>
    <View style={styles.row}><View style={{ flex: 1 }}><Text style={[styles.title, { color: theme.text }]}>Mit Face ID / Touch ID sperren</Text><Text style={[styles.hint, { color: theme.subtext }]}>Nach dem Verlassen der App erneut entsperren. Der Gerätecode bleibt als Alternative verfügbar.</Text></View><Switch value={privacy.enabled} disabled={privacy.busy || !privacy.initialized} onValueChange={value => { void changeLock(value); }} /></View>
    <View style={[styles.row, { marginTop: 18 }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: theme.text }]}>Mitteilungstexte ausblenden</Text><Text style={[styles.hint, { color: theme.subtext }]}>Erinnerungen zeigen keine Aufgaben- oder Listentitel. Bereits geplante Mitteilungen werden ebenfalls angepasst.</Text></View><Switch value={privacy.hideNotificationText} disabled={privacy.busy || !privacy.initialized} onValueChange={value => { void changeText(value); }} /></View>
    <Text style={[styles.hint, { color: theme.subtext, marginTop: 15 }]}>Widgets bleiben separat sichtbar. Ihre Anzeige auf dem Sperrbildschirm steuerst du in den iPhone-Einstellungen.</Text>
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 16, borderWidth: 1, marginBottom: 16 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { fontSize: 15, fontWeight: '600' }, hint: { fontSize: 12, lineHeight: 19, marginTop: 5 } });
