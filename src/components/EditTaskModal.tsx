import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Task, TaskPriority } from '../db/taskRepo';
import type { TaskList } from '../db/taskListRepo';
import { useTheme } from '../hooks/useTheme';

interface EditTaskModalProps {
  task: Task | null;
  taskLists: TaskList[];
  visible: boolean;
  onClose: () => void;
  onSave: (
    id: string,
    updates: Partial<
      Pick<Task, 'title' | 'notes' | 'status' | 'due' | 'priority' | 'reminderAt'>
    >
  ) => void;
  onMoveTask: (
    taskId: string,
    fromListId: string,
    toListId: string,
    toIndex: number
  ) => void;
  onDelete: (id: string) => void;
}

const PRIORITIES: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'none', label: 'Keine', color: '#8E8E93' },
  { value: 'low', label: '! Niedrig', color: '#007AFF' },
  { value: 'medium', label: '!! Mittel', color: '#FF9500' },
  { value: 'high', label: '!!! Hoch', color: '#FF3B30' },
];

export function EditTaskModal({
  task,
  taskLists,
  visible,
  onClose,
  onSave,
  onMoveTask,
  onDelete,
}: EditTaskModalProps) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string>('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes || '');
      setDue(task.due ?? null);
      setPriority(task.priority || 'none');
      setReminderAt(task.reminderAt ?? null);
      setSelectedListId(task.listId);
    }
  }, [task]);

  if (!task) return null;

  const setRelativeDue = (daysFromNow: number | null) => {
    if (daysFromNow === null) {
      setDue(null);
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(12, 0, 0, 0);
    setDue(d.toISOString());
  };

  const setReminderOption = (mode: 'in1h' | 'today18' | 'tomorrow9' | 'clear') => {
    if (mode === 'clear') {
      setReminderAt(null);
      return;
    }
    const d = new Date();
    if (mode === 'in1h') {
      d.setHours(d.getHours() + 1);
    } else if (mode === 'today18') {
      d.setHours(18, 0, 0, 0);
      if (d.getTime() <= Date.now()) {
        d.setDate(d.getDate() + 1);
      }
    } else if (mode === 'tomorrow9') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    }
    setReminderAt(d.toISOString());
  };

  const handleSave = () => {
    if (title.trim()) {
      onSave(task.id, {
        title: title.trim(),
        notes: notes.trim(),
        due,
        priority,
        reminderAt,
      });
      if (selectedListId && selectedListId !== task.listId) {
        onMoveTask(task.id, task.listId, selectedListId, 0);
      }
      onClose();
    }
  };

  const handleDelete = () => {
    onDelete(task.id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        {/* Apple iOS Sheet Header */}
        <View
          style={[
            styles.header,
            { backgroundColor: theme.surface, borderBottomColor: theme.border },
          ]}
        >
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.cancelText, { color: theme.accent }]}>
              Abbrechen
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Details
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={[styles.saveText, { color: theme.accent }]}>
              Fertig
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
          {/* Grouped iOS Card: Title & Notes */}
          <View
            style={[styles.iosGroup, { backgroundColor: theme.cardBg }]}
          >
            <TextInput
              style={[
                styles.titleInput,
                { color: theme.text, borderBottomColor: theme.border },
              ]}
              value={title}
              onChangeText={setTitle}
              placeholder="Titel"
              placeholderTextColor={theme.subtext}
            />
            <TextInput
              style={[styles.notesInput, { color: theme.text }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notizen"
              placeholderTextColor={theme.subtext}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* List Selection */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.subtext }]}>LISTE</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {taskLists.map((list) => {
                const isSelected = list.id === selectedListId;
                return (
                  <TouchableOpacity
                    key={list.id}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected
                          ? theme.accent
                          : theme.cardBg,
                      },
                    ]}
                    onPress={() => setSelectedListId(list.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: isSelected ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      {list.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Priority Selection (Apple Reminders style) */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.subtext }]}>
              PRIORITÄT
            </Text>
            <View style={styles.chipRow}>
              {PRIORITIES.map((p) => {
                const active = priority === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? p.color : theme.cardBg,
                      },
                    ]}
                    onPress={() => setPriority(p.value)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* iPhone Push Reminder Selection */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.subtext }]}>
              IPHONE MITTEILUNG / ERINNERUNG{' '}
              {reminderAt
                ? `(${new Date(reminderAt).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })} Uhr)`
                : '(Aus)'}
            </Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: theme.cardBg }]}
                onPress={() => setReminderOption('in1h')}
              >
                <Ionicons
                  name="notifications-outline"
                  size={15}
                  color={theme.accent}
                />
                <Text style={[styles.chipText, { color: theme.text }]}>
                  In 1 Std.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: theme.cardBg }]}
                onPress={() => setReminderOption('today18')}
              >
                <Ionicons name="moon-outline" size={15} color="#FF9500" />
                <Text style={[styles.chipText, { color: theme.text }]}>
                  18:00 Uhr
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: theme.cardBg }]}
                onPress={() => setReminderOption('tomorrow9')}
              >
                <Ionicons name="sunny-outline" size={15} color="#34C759" />
                <Text style={[styles.chipText, { color: theme.text }]}>
                  Morgen 09:00
                </Text>
              </TouchableOpacity>
              {reminderAt ? (
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: theme.cardBg }]}
                  onPress={() => setReminderOption('clear')}
                >
                  <Ionicons name="close-circle" size={15} color="#FF3B30" />
                  <Text style={[styles.chipText, { color: '#FF3B30' }]}>
                    Aus
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Due Date Quick Picker */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.subtext }]}>
              FÄLLIGKEITSDATUM{' '}
              {due
                ? `(${new Date(due).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })})`
                : '(Keins)'}
            </Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: theme.cardBg }]}
                onPress={() => setRelativeDue(0)}
              >
                <Ionicons name="today-outline" size={15} color="#FF9500" />
                <Text style={[styles.chipText, { color: theme.text }]}>
                  Heute
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: theme.cardBg }]}
                onPress={() => setRelativeDue(1)}
              >
                <Ionicons
                  name="calendar-outline"
                  size={15}
                  color={theme.accent}
                />
                <Text style={[styles.chipText, { color: theme.text }]}>
                  Morgen
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: theme.cardBg }]}
                onPress={() => setRelativeDue(7)}
              >
                <Ionicons name="time-outline" size={15} color="#34C759" />
                <Text style={[styles.chipText, { color: theme.text }]}>
                  +7 Tage
                </Text>
              </TouchableOpacity>
              {due ? (
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: theme.cardBg }]}
                  onPress={() => setRelativeDue(null)}
                >
                  <Ionicons name="close-circle" size={15} color="#FF3B30" />
                  <Text style={[styles.chipText, { color: '#FF3B30' }]}>
                    Keins
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Delete */}
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: theme.cardBg }]}
            onPress={handleDelete}
          >
            <Text style={styles.deleteText}>Aufgabe löschen</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: 17,
  },
  saveText: {
    fontSize: 17,
    fontWeight: '600',
  },
  form: {
    flex: 1,
    padding: 16,
  },
  iosGroup: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 22,
  },
  titleInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notesInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 85,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    marginBottom: 40,
  },
  deleteText: {
    fontSize: 16,
    color: '#FF3B30',
    fontWeight: '500',
  },
});
