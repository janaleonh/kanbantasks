import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { KanbanBoard } from '../src/components/KanbanBoard';
import { EditTaskModal } from '../src/components/EditTaskModal';
import { SyncStatusBadge } from '../src/components/SyncStatusBadge';
import { LiquidGlassBackground } from '../src/components/LiquidGlassBackground';
import { useKanbanStore, type DueFilter } from '../src/stores/useKanbanStore';
import { useSyncOnReconnect } from '../src/hooks/useSyncOnReconnect';
import { useTheme } from '../src/hooks/useTheme';
import { loadCachedUser, type GoogleUser } from '../src/auth/googleAuth';
import type { Task } from '../src/db/taskRepo';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const {
    taskLists,
    tasksByList,
    isLoading,
    syncState,
    error,
    showCompletedByDefault,
    showOverviewHeader,
    boardLayout,
    searchQuery,
    dueFilter,
    activeFocusTaskId,
    loadAll,
    syncWithGoogle,
    addTaskList,
    renameTaskList,
    setTaskListColor,
    reorderTaskLists,
    addTask,
    updateTask,
    moveTask,
    removeTask,
    toggleTask,
    setBoardLayout,
    setSearchQuery,
    setDueFilter,
    tickFocusTimer,
  } = useKanbanStore();

  const { isConnected } = useSyncOnReconnect(syncWithGoogle);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);

  useEffect(() => {
    loadCachedUser().then(setUser).catch(console.error);
    loadAll().then(() => {
      syncWithGoogle();
    });
  }, [loadAll, syncWithGoogle]);

  // Focus timer 1s interval
  useEffect(() => {
    if (!activeFocusTaskId) return;
    const interval = setInterval(() => {
      tickFocusTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, [activeFocusTaskId, tickFocusTimer]);

  const visibleLists = useMemo(
    () => taskLists.filter((l) => l.isVisible),
    [taskLists]
  );

  const filteredTasksByList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = new Date();
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    ).getTime();

    const result: Record<string, Task[]> = {};
    for (const listId of Object.keys(tasksByList)) {
      result[listId] = (tasksByList[listId] || []).filter((t) => {
        if (q) {
          const matchTitle = t.title.toLowerCase().includes(q);
          const matchNotes = (t.notes || '').toLowerCase().includes(q);
          if (!matchTitle && !matchNotes) return false;
        }
        if (dueFilter === 'today') {
          if (!t.due || t.status === 'completed') return false;
          const dueTime = new Date(t.due).getTime();
          return dueTime <= endOfToday;
        }
        if (dueFilter === 'overdue') {
          if (!t.due || t.status === 'completed') return false;
          return new Date(t.due).setHours(23, 59, 59, 999) < Date.now();
        }
        return true;
      });
    }
    return result;
  }, [tasksByList, searchQuery, dueFilter]);

  const stats = useMemo(() => {
    let pending = taskLists.filter((l) => l.syncStatus === 'pending').length;
    let open = 0;
    let done = 0;
    let today = 0;
    let overdue = 0;

    const now = new Date();
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    ).getTime();

    for (const list of visibleLists) {
      const listTasks = tasksByList[list.id] || [];
      for (const t of listTasks) {
        if (t.syncStatus === 'pending') pending++;
        if (t.status === 'completed') {
          done++;
        } else {
          open++;
          if (t.due) {
            const dTime = new Date(t.due).setHours(23, 59, 59, 999);
            if (dTime < Date.now()) overdue++;
            if (dTime <= endOfToday) today++;
          }
        }
      }
    }
    return { pendingCount: pending, open, done, today, overdue };
  }, [taskLists, visibleLists, tasksByList]);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setIsModalVisible(true);
  }, []);

  const handleSaveTask = useCallback(
    (
      id: string,
      updates: Partial<
        Pick<
          Task,
          'title' | 'notes' | 'status' | 'due' | 'priority' | 'reminderAt'
        >
      >
    ) => {
      updateTask(id, updates);
    },
    [updateTask]
  );

  const handleCloseModal = useCallback(() => {
    setIsModalVisible(false);
    setEditingTask(null);
  }, []);

  const toggleLayout = useCallback(() => {
    setBoardLayout(boardLayout === 'horizontal' ? 'vertical' : 'horizontal');
  }, [boardLayout, setBoardLayout]);

  const handleQuickAddTask = useCallback(() => {
    const firstList = visibleLists[0];
    if (!firstList) {
      Alert.alert('Keine Liste', 'Bitte erstelle zuerst eine Liste.');
      return;
    }
    Alert.prompt(
      `Neue Aufgabe (${firstList.title})`,
      'Titel der Aufgabe eingeben:',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Hinzufügen',
          onPress: (txt?: string) => {
            if (txt?.trim()) {
              addTask(firstList.id, txt.trim());
            }
          },
        },
      ],
      'plain-text'
    );
  }, [visibleLists, addTask]);

  if (isLoading && taskLists.length === 0) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.subtext }]}>
          Lade Erinnerungen...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* iOS 27 Liquid Glass Ambient Refraction Backdrop */}
      <LiquidGlassBackground />

      {/* Native Apple iOS Large Title Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.titleRow}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Aufgaben
            </Text>
            <SyncStatusBadge
              isConnected={isConnected}
              syncState={syncState}
              pendingCount={stats.pendingCount}
            />
          </View>

          <View
            style={[
              styles.actionCluster,
              {
                backgroundColor: theme.isGlass ? 'transparent' : theme.pillBg,
                borderTopColor: theme.glassBorderBright,
                borderLeftColor: theme.glassBorderBright,
                borderRightColor: theme.glassBorderDim,
                borderBottomColor: theme.glassBorderDim,
              },
            ]}
          >
            {theme.isGlass && (
              <BlurView
                intensity={theme.isDark ? 45 : 65}
                tint={theme.isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
            )}
            <TouchableOpacity
              onPress={toggleLayout}
              style={styles.iconPillBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name={
                  boardLayout === 'vertical'
                    ? 'reorder-four-outline'
                    : 'albums-outline'
                }
                size={20}
                color={theme.accent}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowSearchBar((prev) => !prev)}
              style={styles.iconPillBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name="search-outline"
                size={20}
                color={
                  showSearchBar || searchQuery ? theme.accent : theme.text
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={syncWithGoogle}
              disabled={syncState === 'syncing'}
              style={styles.iconPillBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name="sync-outline"
                size={20}
                color={syncState === 'syncing' ? theme.subtext : theme.text}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={styles.iconPillBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name="ellipsis-horizontal-circle-outline"
                size={22}
                color={theme.text}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      {showSearchBar && (
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchInputBox,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.glassBorderBright,
              },
            ]}
          >
            <Ionicons name="search" size={16} color={theme.subtext} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Suchen"
              placeholderTextColor={theme.subtext}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={theme.subtext} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}

      {/* Not logged in banner */}
      {!user && taskLists.length === 0 ? (
        <View
          style={[
            styles.emptyState,
            { backgroundColor: theme.cardBg },
          ]}
        >
          <Ionicons name="logo-google" size={40} color="#007AFF" />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Mit Google Tasks verbinden
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>
            Melde dich in den Einstellungen an, um deine Google Tasks-Listen zu
            synchronisieren.
          </Text>
          <TouchableOpacity
            style={[styles.connectButton, { backgroundColor: theme.accent }]}
            onPress={() => router.push('/settings')}
          >
            <Text style={styles.connectButtonText}>Einstellungen öffnen</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color="#FF3B30" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Kanban Board */}
      <KanbanBoard
        taskLists={visibleLists}
        tasksByList={filteredTasksByList}
        layoutMode={boardLayout}
        showCompletedByDefault={showCompletedByDefault}
        onAddList={addTaskList}
        onRenameList={renameTaskList}
        onChangeColor={setTaskListColor}
        onReorderLists={reorderTaskLists}
        onAddTask={addTask}
        onToggleTask={toggleTask}
        onDeleteTask={removeTask}
        onMoveTask={moveTask}
        onEditTask={handleEditTask}
      />

      {/* Apple-style Quick Capture Floating Button */}
      {visibleLists.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleQuickAddTask}
          style={[styles.fab, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Edit Task Modal */}
      <EditTaskModal
        task={editingTask}
        taskLists={taskLists}
        visible={isModalVisible}
        onClose={handleCloseModal}
        onSave={handleSaveTask}
        onMoveTask={moveTask}
        onDelete={removeTask}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '500',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  actionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  iconPillBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  summaryTile: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: 'space-between',
  },
  summaryTileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  summaryIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCount: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  emptyState: {
    margin: 20,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  connectButton: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 8,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF3B3018',
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    color: '#FF3B30',
    fontWeight: '500',
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
