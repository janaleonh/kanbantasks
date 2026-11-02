import React, { useState, useEffect, useRef } from 'react';
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
  Pressable,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { Task, TaskPriority } from '../db/taskRepo';
import type { TaskList } from '../db/taskListRepo';
import { useTheme } from '../hooks/useTheme';
import { useRouter } from 'expo-router';
import { TaskDetailsEditor } from './TaskDetailsEditor';
import type { TaskUpdates } from '../db/taskRepo';
import { getTaskById } from '../db/taskRepo';
import type { ChecklistItem, RepeatRule, TaskAttachment } from '../tasks/details';
import { validateDetails } from '../tasks/details';
import { useDocumentStore } from '../stores/useDocumentStore';
import DateTimePicker from '@react-native-community/datetimepicker';

interface EditTaskModalProps {
  task: Task | null;
  taskLists: TaskList[];
  visible: boolean;
  onClose: () => void;
  onSave: (
    id: string,
    updates: TaskUpdates
  ) => void | Promise<void>;
  onMoveTask: (
    taskId: string,
    fromListId: string,
    toListId: string,
    toIndex: number
  ) => void | Promise<void>;
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
  const router = useRouter();
  const [recurrence, setRecurrence] = useState<RepeatRule | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [project, setProject] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'needsAction' | 'completed'>('needsAction');
  const [due, setDue] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const insets = initialWindowMetrics?.insets ?? { bottom: 24, top: 0, left: 0, right: 0 };
  const { height: screenHeight } = useWindowDimensions();
  const formRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes || '');
      setStatus(task.status);
      setDue(task.due ?? null);
      setPriority(task.priority || 'none');
      setReminderAt(task.reminderAt ?? null);
      setSelectedListId(task.listId);
      setRecurrence(task.recurrence ?? null);
      setChecklist(task.checklist || []);
      setAttachments(task.attachments || []);
      setProject(task.project || '');
      setTags((task.tags || []).join(', '));
      setShowDuePicker(false);
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

  const handleSave = async () => {
    if (savingRef.current) return false;
    if (title.trim()) {
      setSaving(true);
      savingRef.current = true;
      try {
      const labels = validateDetails({ project, tags: tags.split(',').map(tag => tag.trim()).filter(Boolean) });
      validateDetails({ recurrence, checklist, attachments });
      if (selectedListId && selectedListId !== task.listId) {
        await onMoveTask(task.id, task.listId, selectedListId, 0);
        if ((await getTaskById(task.id))?.listId !== selectedListId) throw new Error('Die Aufgabe konnte nicht in die gewählte Liste verschoben werden.');
      }
      await onSave(task.id, {
        title: title.trim(),
        notes: notes.trim(),
        status,
        due,
        priority,
        reminderAt,
        recurrence: recurrence && due !== task.due ? { frequency: recurrence.frequency, interval: recurrence.interval } : recurrence, checklist, attachments, ...labels,
      });
      onClose();
      return true;
      } catch (err) { Alert.alert('Aufgabe nicht gespeichert', err instanceof Error ? err.message : 'Bitte versuche es erneut.'); return false; }
      finally { savingRef.current = false; setSaving(false); }
    }
    return false;
  };

  const handleDelete = () => {
    Alert.alert('Aufgabe löschen?', `„${task.title}“ wird gelöscht.`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => {
        onDelete(task.id);
        onClose();
      } },
    ]);
  };

  const maxSheetHeight = Math.min(screenHeight * 0.84, 750);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
      <View style={[styles.modalOverlay, { paddingTop: insets.top + 8 }]}>
        {/* Upper dim backdrop - tap anywhere above to close */}
        <Pressable style={styles.backdrop} onPress={onClose} />

          <View
            style={[
              styles.sheetContainer,
              {
                height: maxSheetHeight,
                backgroundColor: theme.isGlass
                  ? theme.isDark
                    ? 'rgba(16, 20, 32, 0.95)'
                    : 'rgba(255, 255, 255, 0.96)'
                  : theme.surface,
                borderTopColor: theme.glassBorderBright,
                borderLeftColor: theme.glassBorderBright,
                borderRightColor: theme.glassBorderDim,
              },
            ]}
          >
            {theme.isGlass && (
              <BlurView
                intensity={theme.isDark ? 65 : 85}
                tint={theme.isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
            )}

            {/* Apple Grabber Bar */}
            <View style={styles.grabberRow}>
              <View
                style={[
                  styles.grabberPill,
                  {
                    backgroundColor: theme.isDark
                      ? 'rgba(255, 255, 255, 0.28)'
                      : 'rgba(0, 0, 0, 0.20)',
                  },
                ]}
              />
            </View>

            {/* Ergonomic Header with Close Icon */}
            <View
              style={[
                styles.header,
                { borderBottomColor: theme.glassBorderDim },
              ]}
            >
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                Aufgabe bearbeiten
              </Text>
              <TouchableOpacity
                onPress={handleDelete}
                accessibilityRole="button"
                accessibilityLabel="Aufgabe löschen"
                style={styles.headerDeleteButton}
              >
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[
                  styles.closeCircleBtn,
                  {
                    backgroundColor: theme.isDark
                      ? 'rgba(255, 255, 255, 0.10)'
                      : 'rgba(0, 0, 0, 0.06)',
                  },
                ]}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={formRef}
              style={styles.form}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
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
              onFocus={() => formRef.current?.scrollTo({ y: 0, animated: true })}
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
              scrollEnabled
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* List Selection */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.subtext }]}>PROJEKT & TAGS</Text>
            <TextInput accessibilityLabel="Projekt" value={project} onChangeText={setProject} maxLength={80} placeholder="Projekt, z. B. Renovierung" placeholderTextColor={theme.subtext} style={[styles.notesInput, { color: theme.text, backgroundColor: theme.cardBg, minHeight: 45, borderRadius: 12, marginBottom: 8 }]} />
            <TextInput accessibilityLabel="Tags, durch Komma getrennt" value={tags} onChangeText={setTags} placeholder="Tags: privat, wichtig" placeholderTextColor={theme.subtext} style={[styles.notesInput, { color: theme.text, backgroundColor: theme.cardBg, minHeight: 45, borderRadius: 12 }]} />
          </View>
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
                        { color: isSelected ? (theme.onAccent ?? '#FFFFFF') : theme.text },
                      ]}
                    >
                      {list.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Status (Offen / Erledigt) */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.subtext }]}>STATUS</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      status === 'needsAction' ? theme.accent : theme.cardBg,
                  },
                ]}
                onPress={() => setStatus('needsAction')}
              >
                <Ionicons
                  name="radio-button-off"
                  size={15}
                  color={status === 'needsAction' ? (theme.onAccent ?? '#FFFFFF') : theme.text}
                />
                <Text
                  style={[
                    styles.chipText,
                    { color: status === 'needsAction' ? (theme.onAccent ?? '#FFFFFF') : theme.text },
                  ]}
                >
                  Offen
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      status === 'completed' ? '#34C759' : theme.cardBg,
                  },
                ]}
                onPress={() => setStatus('completed')}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={15}
                  color={status === 'completed' ? '#FFFFFF' : '#34C759'}
                />
                <Text
                  style={[
                    styles.chipText,
                    { color: status === 'completed' ? '#FFFFFF' : theme.text },
                  ]}
                >
                  Erledigt
                </Text>
              </TouchableOpacity>
            </View>
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
          {showDuePicker && <DateTimePicker mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} value={due ? new Date(due) : new Date()} onChange={(event, date) => { if (Platform.OS !== 'ios' || event.type === 'dismissed') setShowDuePicker(false); if (date) { date.setHours(12, 0, 0, 0); setDue(date.toISOString()); } }} />}
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
              <TouchableOpacity accessibilityRole="button" onPress={() => setShowDuePicker(value => !value)} style={[styles.chip, { backgroundColor: theme.cardBg }]}><Ionicons name="calendar-number-outline" size={15} color={theme.accent} /><Text style={[styles.chipText, { color: theme.text }]}>Datum wählen</Text></TouchableOpacity>
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

          <TaskDetailsEditor recurrence={recurrence} checklist={checklist} attachments={attachments} onRecurrence={setRecurrence} onChecklist={setChecklist} onAttachments={setAttachments} onOpenAttachment={attachment => {
            if (useDocumentStore.getState().config?.id !== attachment.configId) { Alert.alert('Andere NAS-Verbindung', 'Dieses Dokument gehört zu einer anderen NAS-Verbindung. Verbinde zuerst das zugehörige NAS.'); return; }
            void handleSave().then(saved => { if (saved) router.push({ pathname: '/document', params: { path: attachment.path, taskId: task.id } }); });
          }} />
          {status === 'needsAction' && <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => { void handleSave().then(saved => { if (saved) router.push({ pathname: '/focus', params: { taskId: task.id } }); }); }} style={{ padding: 14, borderRadius: 12, backgroundColor: theme.pillBg, marginTop: 12 }}><Text style={{ color: theme.accent, fontWeight: '700', textAlign: 'center' }}>Mit dieser Aufgabe fokussieren</Text></TouchableOpacity>}
        </ScrollView>

        {/* Bottom Thumb-Zone Action Bar */}
        <View
          style={[
            styles.bottomActionBar,
            {
              borderTopColor: theme.glassBorderDim,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.bottomSaveBtn, { backgroundColor: theme.accent }]}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={20} color={theme.onAccent ?? '#FFFFFF'} />
            <Text style={[styles.bottomSaveText, { color: theme.onAccent ?? '#FFFFFF' }]}>Fertig</Text>
          </TouchableOpacity>
        </View>
      </View>
  </View>
    </KeyboardAvoidingView>
</Modal>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheetContainer: {
    flexShrink: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1.2,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 12,
  },
  grabberRow: {
    flexShrink: 0,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  grabberPill: {
    width: 38,
    height: 5,
    borderRadius: 2.5,
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeCircleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    flex: 1,
    minHeight: 0,
  },
  formContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  iosGroup: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
  },
  titleInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16.5,
    fontWeight: '600',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notesInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 80,
    maxHeight: 160,
  },
  field: {
    marginBottom: 18,
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
  headerDeleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    marginRight: 8,
  },
  bottomActionBar: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
  },
  bottomSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  bottomSaveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
