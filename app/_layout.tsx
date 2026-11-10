import { startScanOutbox } from '../src/documents/scanOutbox';
import { startFolderSync } from '../src/documents/folderSync';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { getDatabase } from '../src/db/database';
import { useTheme } from '../src/hooks/useTheme';
import { startWidgetSync } from '../src/widgets/syncWidgets';
import { startCalendarSync } from '../src/calendar/lifecycle';
import { startDocumentSync } from '../src/documents/lifecycle';
import { PrivacyGate } from '../src/components/PrivacyGate';
import { startTaskIntents } from '../src/tasks/intents';
import { startDailyBriefings } from '../src/services/briefingLifecycle';
import { NotificationNavigation } from '../src/components/NotificationNavigation';
import { startAutomaticBackups } from '../src/backup/lifecycle';

export default function RootLayout() {
  const theme = useTheme();
  useEffect(startWidgetSync, []);
  useEffect(startCalendarSync, []);
  useEffect(startDocumentSync, []);
  useEffect(startScanOutbox, []);
  useEffect(startFolderSync, []);
  useEffect(startTaskIntents, []);
  useEffect(startDailyBriefings, []);
  useEffect(startAutomaticBackups, []);
  useEffect(() => {
    // Initialize database on app start
    getDatabase().catch(console.error);
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.container}>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        <PrivacyGate>
        <NotificationNavigation />
        <Stack
          screenOptions={{
            headerShown: false,
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="search" options={{ headerShown: true, headerTitle: 'Suche' }} />
          <Stack.Screen name="projects" options={{ headerShown: true, headerTitle: 'Projekte & Tags' }} />
          <Stack.Screen name="history" options={{ headerShown: true, headerTitle: 'Verlauf' }} />
          <Stack.Screen name="focus" options={{ headerShown: true, headerTitle: 'Fokus' }} />
          <Stack.Screen name="backups" options={{ headerShown: true, headerTitle: 'Backups' }} />
          <Stack.Screen name="scan" options={{ headerShown: true, headerTitle: 'Dokument scannen' }} />
          <Stack.Screen name="task" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="capture" options={{ headerShown: true, headerTitle: 'Neue Aufgabe' }} />
          <Stack.Screen name="calendar" options={{ headerShown: true, headerTitle: 'Kalender', headerBackTitle: 'Aufgaben' }} />
          <Stack.Screen name="documents" options={{ headerShown: true, headerTitle: 'Dokumente', headerBackTitle: 'Planner' }} />
          <Stack.Screen name="document" options={{ headerShown: true, headerTitle: 'Dokument', headerBackTitle: 'Dokumente' }} />
          <Stack.Screen name="nas-settings" options={{ headerShown: true, headerTitle: 'Synology NAS', headerBackTitle: 'Zurück' }} />
        <Stack.Screen name="event" options={{ presentation: 'modal', headerShown: true, headerTitle: 'Termin' }} />
          <Stack.Screen
            name="settings"
            options={{
              presentation: 'modal',
              headerShown: true,
              headerTitle: 'Einstellungen',
            }}
          />
        </Stack>
        </PrivacyGate>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
