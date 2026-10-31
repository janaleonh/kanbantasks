import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { Task } from '../db/taskRepo';
import { useTheme } from '../hooks/useTheme';
import { useKanbanStore } from '../stores/useKanbanStore';
import {
  scheduleFocusTimerNotification,
  cancelFocusTimerNotification,
} from '../services/notifications';

interface TaskCardProps {
  task: Task;
  accentColor?: string;
  isDragging?: boolean;
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
  onToggle,
  onEdit,
  onStartDrag,
}: TaskCardProps) {
  const theme = useTheme();
  const activeFocusTaskId = useKanbanStore((s) => s.activeFocusTaskId);
  const focusRemainingSeconds = useKanbanStore((s) => s.focusRemainingSeconds);
  const startFocusTimer = useKanbanStore((s) => s.startFocusTimer);
  const stopFocusTimer = useKanbanStore((s) => s.stopFocusTimer);

  const isCompleted = task.status === 'completed';
  const isFocused = activeFocusTaskId === task.id;
  const prio = PRIORITY_META[task.priority || 'none'];

  const handleLongPress = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.pageX || 150;
    const y = e.nativeEvent.pageY || 300;
    onStartDrag(task, x, y);
  };

  const handleToggleFocus = () => {
    if (isFocused) {
      stopFocusTimer();
      cancelFocusTimerNotification();
    } else {
      startFocusTimer(task.id, 25);
      scheduleFocusTimerNotification(task.title, 25 * 60);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isOverdue =
    task.due &&
    !isCompleted &&
    new Date(task.due).setHours(23, 59, 59, 999) < Date.now();

  return (
    <Pressable
      onPress={() => onEdit(task)}
      onLongPress={handleLongPress}
      delayLongPress={180}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.isGlass ? 'transparent' : theme.cardBg,
          borderRadius: theme.cardRadius,
          borderWidth: isFocused ? 2 : 1.1,
          borderTopColor: isFocused ? accentColor : theme.glassBorderBright,
          borderLeftColor: isFocused ? accentColor : theme.glassBorderBright,
          borderRightColor: isFocused ? accentColor : theme.glassBorderDim,
          borderBottomColor: isFocused ? accentColor : theme.glassBorderDim,
        },
        isCompleted && styles.completedCard,
        pressed && !isDragging && styles.pressedCard,
        isDragging && [
          styles.draggingPlaceholder,
          { borderColor: accentColor },
        ],
      ]}
    >
      {/* iOS 27 Liquid Glass Card Surface */}
      {theme.isGlass && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <BlurView
            intensity={theme.isDark ? 35 : 50}
            tint={theme.isDark ? 'light' : 'default'}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[theme.glassSheenStart, theme.glassSheenEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      {/* Glowing Left Accent Capsule */}
      <View
        style={[
          styles.accentBar,
          {
            backgroundColor: isCompleted ? theme.subtext : accentColor,
          },
        ]}
      />

      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          {/* Liquid Glass Checkbox */}
          <TouchableOpacity
            onPress={() => onToggle(task.id)}
            style={styles.checkboxHit}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View
              style={[
                styles.checkOuter,
                {
                  borderRadius: theme.useCircularCheckbox ? 12 : 7,
                  borderColor: isCompleted ? '#34C759' : accentColor,
                  backgroundColor: isCompleted
                    ? '#34C759'
                    : accentColor + '24',
                },
              ]}
            >
              {isCompleted && (
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.titleContainer}>
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

            {task.notes ? (
              <Text
                style={[styles.notes, { color: theme.subtext }]}
                numberOfLines={2}
              >
                {task.notes}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Badges & Action Pills Footer */}
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

          <View style={styles.metaRight}>
            {!isCompleted && (
              <TouchableOpacity
                onPress={handleToggleFocus}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={[
                  styles.focusPill,
                  isFocused
                    ? {
                        backgroundColor: accentColor,
                        borderColor: theme.glassBorderBright,
                      }
                    : {
                        backgroundColor: theme.pillBg,
                        borderColor: theme.glassBorderBright,
                      },
                ]}
              >
                <Ionicons
                  name={isFocused ? 'pause' : 'timer-outline'}
                  size={12}
                  color={isFocused ? '#FFFFFF' : theme.subtext}
                />
                <Text
                  style={[
                    styles.focusText,
                    { color: isFocused ? '#FFFFFF' : theme.subtext },
                  ]}
                >
                  {isFocused ? formatTimer(focusRemainingSeconds) : '25m'}
                </Text>
              </TouchableOpacity>
            )}

            {task.syncStatus === 'pending' ? (
              <Ionicons
                name="cloud-upload-outline"
                size={13}
                color={accentColor}
                style={{ opacity: 0.85 }}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  accentBar: {
    width: 4.5,
  },
  cardBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  pressedCard: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  completedCard: {
    opacity: 0.55,
  },
  draggingPlaceholder: {
    opacity: 0.25,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  checkboxHit: {
    marginTop: 1,
  },
  checkOuter: {
    width: 23,
    height: 23,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
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
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 9,
    paddingLeft: 34,
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
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  focusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  focusText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
