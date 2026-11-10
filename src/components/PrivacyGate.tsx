import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { usePrivacyStore } from '../stores/usePrivacyStore';
import { useTheme } from '../hooks/useTheme';

export function PrivacyGate({ children }: { children: React.ReactNode }) {
  const { initialized, enabled, locked, busy, error, initialize, unlock, lock } = usePrivacyStore();
  const theme = useTheme();
  const [phase, setPhase] = useState(AppState.currentState);
  const [opened, setOpened] = useState(false);
  const trying = useRef(false);
  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => { if (initialized && !locked) setOpened(true); }, [initialized, locked]);
  useEffect(() => {
    if (Platform.OS === 'ios') {
      const operation = enabled ? ScreenCapture.enableAppSwitcherProtectionAsync(1) : ScreenCapture.disableAppSwitcherProtectionAsync();
      void operation.catch(() => {});
    }
  }, [enabled]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => { setPhase(next); if (next === 'background') { trying.current = false; lock(); } });
    setPhase(AppState.currentState);
    return () => subscription.remove();
  }, [lock]);
  useEffect(() => {
    if (initialized && enabled && locked && !busy && phase === 'active' && !trying.current) {
      trying.current = true; void unlock();
    }
    if (!locked) trying.current = false;
  }, [initialized, enabled, locked, busy, phase, unlock]);
  const blocked = !initialized || locked;
  const screen = <View style={[styles.cover, { backgroundColor: theme.background }]}>
    <Text style={[styles.title, { color: theme.text }]}>Planner</Text>
    <Text style={[styles.label, { color: theme.subtext }]}>{initialized ? 'Deine Inhalte sind geschützt.' : 'Planner wird vorbereitet …'}</Text>
    {busy ? <ActivityIndicator color={theme.accent} /> : <TouchableOpacity accessibilityRole="button" onPress={() => { void (initialized ? unlock() : initialize()); }} style={[styles.button, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent ?? '#fff', fontWeight: '600' }}>{initialized ? 'Entsperren' : 'Erneut versuchen'}</Text></TouchableOpacity>}
    {!!error && <Text accessibilityRole="alert" style={[styles.label, { color: theme.subtext }]}>{error}</Text>}
  </View>;
  // Keep drafts mounted after the first unlock; a native modal also covers task modals.
  if (!opened) return screen;
  return <>{children}{blocked && <Modal visible animationType="none" presentationStyle="fullScreen" onRequestClose={() => {}}>{screen}</Modal>}</>;
}

const styles = StyleSheet.create({ cover: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 20 }, title: { fontSize: 32, fontWeight: '700' }, label: { fontSize: 14, lineHeight: 22, textAlign: 'center' }, button: { borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 } });
