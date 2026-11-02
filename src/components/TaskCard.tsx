import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { Task } from '../db/taskRepo';
import { useTheme } from '../hooks/useTheme';

interface TaskCardProps {
  task: Task;
  accentColor?: string;
  isDragging?: boolean;
  onLayoutCard?: (taskId: string, y: number, height: number) => void;
  onToggle: (id: string) => void;
  onEdit: (task: Task) => void;
  onStartDrag: (task: Task, pageX: number, pageY: number) => void;
}

const PRIORITY_META = {
  none: null,
  low: { label: '! Niedrig', color: '#007AFF' },
  medium: { label: '!! Mittel', color: '#FF9500' },
  high: { label: '!!! Hoch', color: '#FF3B30' },
};

export function TaskCard({
  task,
  accentColor = '#007AFF',
  isDragging = false,
  onLayoutCard,
  onToggle,
  onEdit,
  onStartDrag,
}: TaskCardProps) {
  const theme = useTheme();

  const isCompleted = task.status === 'completed';
  const prio = PRIORITY_META[task.priority || 'none'];

  const lastTapRef = useRef<number>(0);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
    };
  }, []);

  // Double-tap toggles completed status with haptic feedback
  // Single-tap opens Edit modal after a brief delay
  const handleCardPress = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 280;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
      lastTapRef.current = 0;
      Haptics.notificationAsync(
        isCompleted
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      ).catch(() => {});
      onToggle(task.id);
    } else {
      lastTapRef.current = now;
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
      singleTapTimeoutRef.current = setTimeout(() => {
        singleTapTimeoutRef.current = null;
        onEdit(task);
      }, DOUBLE_TAP_DELAY);
    }
  };

  const handleLongPress = (e: GestureResponderEvent) => {
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }
    const x = e.nativeEvent.pageX || 150;
    const y = e.nativeEvent.pageY || 300;
    onStartDrag(task, x, y);
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    onLayoutCard?.(task.id, y, height);
  };

  const isOverdue =
    task.due &&
    !isCompleted &&
    new Date(task.due).setHours(23, 59, 59, 999) < Date.now();

  const hasBadges = Boolean(
    (prio && !isCompleted) || task.due || task.reminderAt
  );

  return (
    <Pressable
      onLayout={handleLayout}
      onPress={handleCardPress}
      onLongPress={handleLongPress}
      delayLongPress={160}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.isGlass ? 'transparent' : theme.cardBg,
          borderRadius: theme.cardRadius,
          borderWidth: 1.1,
          borderTopColor: theme.isGlass ? theme.glassBorderBright : theme.cardBorder,
          borderLeftColor: theme.isGlass ? theme.glassBorderBright : theme.cardBorder,
          borderRightColor: theme.isGlass ? theme.glassBorderDim : theme.cardBorder,
          borderBottomColor: theme.isGlass ? theme.glassBorderDim : theme.cardBorder,
          marginBottom: theme.cardGap ?? 10,
          shadowOpacity: theme.cardShadowOpacity ?? 0.1,
          elevation: theme.cardShadowOpacity !== undefined ? 0 : 3,
        },
        isCompleted && styles.completedCard,
        pressed && !isDragging && styles.pressedCard,
        isDragging && [
          styles.draggingPlaceholder,
          { borderColor: accentColor },
        ],
      ]}
    >
      {/* iOS Liquid Glass Card Surface with Atmospheric Color Tint */}
      {theme.isGlass && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <BlurView
            intensity={theme.isDark ? 40 : 55}
            tint={theme.isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[
              accentColor + (theme.isDark ? '14' : '0C'),
              theme.glassSheenStart,
              theme.glassSheenEnd,
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      <View style={[styles.cardBody, theme.cardPadding !== undefined && { padding: theme.cardPadding, paddingVertical: theme.cardPadding, paddingHorizontal: theme.cardPadding }]}>
        <View style={styles.cardHeader}>
          <View style={styles.titleContainer}>
            <View style={styles.titleRow}>
              {isCompleted && (
                <View style={styles.completedBadge}>
                  <Ionicons name="checkmark-circle" size={17} color="#34C759" />
                </View>
              )}
              <Text
                style={[
                  styles.title,
                  { color: theme.text },
                  isCompleted && {
                    textDecorationLine: 'line-through',
                    color: theme.subtext,
                  },
                ]}
                numberOfLines={3}
              >
                {task.title}
              </Text>
            </View>
            {(task.project || task.tags?.length) ? <Text numberOfLines={1} style={{ color: theme.accent, fontSize: 11, marginTop: 5 }}>{[task.project, ...(task.tags || []).map(tag => `#${tag}`)].filter(Boolean).join(' · ')}</Text> : null}
            {(task.recurrence || task.checklist?.length || task.attachments?.length) ? <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 5 }}>{[task.recurrence ? '↻ Wiederholt sich' : '', task.checklist?.length ? `${task.checklist.filter(item => item.done).length}/${task.checklist.length} Schritte` : '', task.attachments?.length ? `📎 ${task.attachments.length}` : ''].filter(Boolean).join(' · ')}</Text> : null}

            {task.notes ? (
              <Text
                style={[styles.notes, { color: theme.subtext }]}
                numberOfLines={2}
              >
                {task.notes}
              </Text>
            ) : null}
          </View>

          <View
            accessible
            accessibilityLabel="Aufgabe verschieben"
            accessibilityHint="Zum Verschieben gedrückt halten und ziehen"
            style={[
              styles.dragGripShell,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.04)',
              },
            ]}
          >
            <Ionicons
              name="reorder-two-outline"
              size={17}
              color={theme.subtext}
            />
          </View>
        </View>

        {/* Badges Footer (only shown when task has priority, due date, reminder, or pending sync) */}
        {hasBadges && (
          <View style={styles.cardFooter}>
            <View style={styles.metaLeft}>
              {prio && !isCompleted ? (
                <View
                  style={[
                    styles.badgePill,
                    {
                      backgroundColor: prio.color + '24',
                      borderColor: prio.color + '55',
                    },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: prio.color }]}>
                    {prio.label}
                  </Text>
                </View>
              ) : null}

              {task.due ? (
                <View
                  style={[
                    styles.badgePill,
                    {
                      backgroundColor: isOverdue
                        ? '#FF3B3026'
                        : accentColor + '22',
                      borderColor: isOverdue
                        ? '#FF3B3066'
                        : accentColor + '50',
                    },
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={11}
                    color={isOverdue ? '#FF3B30' : accentColor}
                  />
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        color: isOverdue
                          ? '#FF3B30'
                          : theme.isDark
                          ? '#FFFFFF'
                          : accentColor,
                      },
                    ]}
                  >
                    {new Date(task.due).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </Text>
                </View>
              ) : null}

              {task.reminderAt ? (
                <View
                  style={[
                    styles.badgePill,
                    {
                      backgroundColor: '#AF52DE26',
                      borderColor: '#AF52DE66',
                    },
                  ]}
                >
                  <Ionicons name="notifications" size={11} color="#AF52DE" />
                  <Text
                    style={[
                      styles.badgeText,
                      { color: theme.isDark ? '#E9D5FF' : '#AF52DE' },
                    ]}
                  >
                    {new Date(task.reminderAt).toLocaleTimeString('de-DE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 13,
    elevation: 3,
  },
  cardBody: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pressedCard: {
    transform: [{ scale: 0.98 }],
    opacity: 0.94,
  },
  completedCard: {
    opacity: 0.6,
  },
  draggingPlaceholder: {
    opacity: 0.25,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  completedBadge: {
    marginTop: 1,
  },
  title: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: -0.25,
    lineHeight: 21,
  },
  notes: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  dragGripShell: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
    marginLeft: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingLeft: 0,
  },
  metaLeft: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});
