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

export default function RootLayout() {
  const theme = useTheme();
  useEffect(startWidgetSync, []);
  useEffect(startCalendarSync, []);
  useEffect(startDocumentSync, []);
  useEffect(() => {
    // Initialize database on app start
    getDatabase().catch(console.error);
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.container}>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="index" />
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
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
