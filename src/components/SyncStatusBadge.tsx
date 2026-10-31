import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SyncStatus } from '../sync/syncEngine';

interface SyncStatusBadgeProps {
  isConnected: boolean | null;
  syncState?: SyncStatus;
  pendingCount?: number;
}

export function SyncStatusBadge({
  isConnected,
  syncState = 'idle',
  pendingCount = 0,
}: SyncStatusBadgeProps) {
  if (isConnected === null) return null;

  if (syncState === 'syncing') {
    return (
      <View style={[styles.badge, styles.syncing]}>
        <ActivityIndicator size={12} color="#007AFF" />
        <Text style={[styles.text, styles.syncingText]}>Sync...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, isConnected ? styles.online : styles.offline]}>
      <Ionicons
        name={isConnected ? 'cloud-done-outline' : 'cloud-offline-outline'}
        size={14}
        color={isConnected ? '#34C759' : '#FF9500'}
      />
      <Text style={[styles.text, isConnected ? styles.onlineText : styles.offlineText]}>
        {isConnected ? 'Online' : 'Offline'}
        {pendingCount > 0 ? ` (${pendingCount})` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  online: {
    backgroundColor: '#E8F5E9',
  },
  offline: {
    backgroundColor: '#FFF3E0',
  },
  syncing: {
    backgroundColor: '#E3F2FD',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  onlineText: {
    color: '#34C759',
  },
  offlineText: {
    color: '#FF9500',
  },
  syncingText: {
    color: '#007AFF',
  },
});
