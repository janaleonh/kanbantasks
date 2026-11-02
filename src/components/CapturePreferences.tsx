import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '../hooks/useTheme';

export function CapturePreferences() {
  const theme = useTheme(), router = useRouter();
  const appName = Constants.expoConfig?.name || 'Kanban Tasks';
  return <View style={{ padding: 16, marginBottom: 16, borderWidth: 1, borderRadius: theme.cardRadius, backgroundColor: theme.cardBg, borderColor: theme.border, gap: 10 }}>
    <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Aufgaben schnell erfassen</Text>
    <Text style={{ color: theme.subtext, fontSize: 13, lineHeight: 20 }}>Teile einen Text oder Webseiten-Link über das iPhone-Teilen-Menü mit {appName}. Du kannst die Aufgabe vor dem Speichern bearbeiten.</Text>
    <Text style={{ color: theme.subtext, fontSize: 13, lineHeight: 20 }}>Siri: „Aufgabe in {appName} hinzufügen“. Den Titel fragt Siri anschließend ab. Die Aktion „Aufgabe in Planner hinzufügen“ findest du auch in Kurzbefehle. Siri-Aufgaben landen in der ersten sichtbaren Liste, sonst im Eingang.</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/capture')} style={{ backgroundColor: theme.pillBg, borderRadius: 10, padding: 12, alignItems: 'center' }}><Text style={{ color: theme.accent, fontWeight: '600' }}>Neue Aufgabe erfassen</Text></TouchableOpacity>
  </View>;
}
