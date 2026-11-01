import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { SyncStatus } from '../sync/syncEngine';
import { useTheme } from '../hooks/useTheme';

interface SyncStatusBadgeProps {
  isConnected: boolean | null;
  syncState?: SyncStatus;
  pendingCount?: number;
  errorMessage?: string | null;
  onRetry?: () => void;
}

export function SyncStatusBadge({
  isConnected,
  syncState = 'idle',
  pendingCount = 0,
  errorMessage,
  onRetry,
}: SyncStatusBadgeProps) {
  const theme = useTheme();
  const offline = isConnected === false;
  if (!offline && syncState !== 'error') return null;
  const detail = offline
    ? pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? 'Änderung wartet' : 'Änderungen warten'} auf Synchronisierung.` : 'Änderungen werden lokal gespeichert.'
    : errorMessage || 'Bitte prüfe die Verbindung zu Google und versuche es erneut.';

  return (
    <View accessibilityLiveRegion="polite" style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.isGlass ? theme.glassBorderBright : theme.border, borderRadius: theme.cardRadius }]}>
      {theme.isGlass && <BlurView intensity={theme.isDark ? 40 : 60} tint={theme.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
        size={20}
        color={theme.accent}
      />
      <View style={styles.copy}>
        <Text accessibilityRole="alert" style={[styles.title, { color: theme.text }]}>{offline ? 'Offline' : 'Synchronisierung fehlgeschlagen'}</Text>
        <Text style={[styles.detail, { color: theme.subtext }]}>{detail}</Text>
      </View>
      {!offline && onRetry && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Synchronisierung erneut versuchen" onPress={onRetry} style={[styles.retry, { backgroundColor: theme.pillBg, borderRadius: Math.min(theme.cardRadius, 12) }]}><Ionicons name="refresh-outline" size={20} color={theme.accent} /></TouchableOpacity>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 13, fontWeight: '600' },
  detail: { fontSize: 12, lineHeight: 17 },
  retry: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
