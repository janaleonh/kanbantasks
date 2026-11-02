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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { KanbanBoard } from '../src/components/KanbanBoard';
import { UndoBanner } from '../src/components/UndoBanner';
import { EditTaskModal } from '../src/components/EditTaskModal';
import { SyncStatusBadge } from '../src/components/SyncStatusBadge';
import { LiquidGlassBackground } from '../src/components/LiquidGlassBackground';
import { useKanbanStore } from '../src/stores/useKanbanStore';
import { useSyncOnReconnect } from '../src/hooks/useSyncOnReconnect';
import { useTheme } from '../src/hooks/useTheme';
import { loadCachedUser, type GoogleUser } from '../src/auth/googleAuth';
import type { Task } from '../src/db/taskRepo';

export default function HomeScreen() {
  const router = useRouter();
  const { widget } = useLocalSearchParams<{ widget?: string }>();
  const theme = useTheme();
  const {
    taskLists,
    tasksByList,
    isLoading,
    syncState,
    error,
    showCompletedByDefault,
    boardLayout,
    columnWidth,
    searchQuery,
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
    setColumnWidth,
    setSearchQuery,
    setDueFilter,
  } = useKanbanStore();

  const { isConnected } = useSyncOnReconnect(syncWithGoogle);

  useEffect(() => {
    // Older Today links also open the single, unfiltered board.
    setDueFilter('all');
    if (widget === 'today' || widget === 'overview') {
      setSearchQuery('');
    }
  }, [widget, setSearchQuery, setDueFilter]);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [widthToast, setWidthToast] = useState<string | null>(null);
  const toastTimeoutRef = React.useRef<any>(null);

  const handleCycleColumnWidth = useCallback(() => {
    // Cycles between 260 (Kompakt), 320 (Standard), 380 (Breit)
    let nextWidth = 320;
    let label = 'Standard (320px)';
    if (columnWidth <= 280) {
      nextWidth = 320;
      label = 'Standard (320px)';
    } else if (columnWidth <= 340) {
      nextWidth = 380;
      label = 'Breit (380px)';
    } else {
      nextWidth = 260;
      label = 'Kompakt (260px)';
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setColumnWidth(nextWidth);
    setWidthToast(label);

    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setWidthToast(null);
    }, 1400);
  }, [columnWidth, setColumnWidth]);

  useEffect(() => {
    loadCachedUser().then(setUser).catch(console.error);
    loadAll().then(() => {
      syncWithGoogle();
    });
  }, [loadAll, syncWithGoogle]);

  const visibleLists = useMemo(
    () => taskLists.filter((l) => l.isVisible),
    [taskLists]
  );

  const filteredTasksByList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result: Record<string, Task[]> = {};
    for (const listId of Object.keys(tasksByList)) {
      result[listId] = (tasksByList[listId] || []).filter((t) => {
        if (q) {
          const matchTitle = t.title.toLowerCase().includes(q);
          const matchNotes = (t.notes || '').toLowerCase().includes(q);
          if (!matchTitle && !matchNotes) return false;
        }
        return true;
      });
    }
    return result;
  }, [tasksByList, searchQuery]);

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
      return updateTask(id, updates);
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

      {/* Board actions and connection issues */}
      <View style={styles.header}>
        <View style={styles.headerNavBar}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.plannerTitle, { color: theme.text, fontFamily: theme.headingFont }]}
          >
            Planner
          </Text>
          <View
            style={[
              styles.actionCluster,
              {
                backgroundColor: theme.isGlass
                  ? theme.isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(255, 255, 255, 0.65)'
                  : theme.pillBg,
                borderColor: theme.glassBorderBright,
              },
            ]}
          >
            {theme.isGlass && (
              <BlurView
                intensity={theme.isDark ? 50 : 70}
                tint={theme.isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
            )}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Aufgabe schnell erfassen" onPress={() => router.push('/capture')} style={styles.iconPillBtn}>
              <Ionicons name="add-circle-outline" size={22} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={toggleLayout}
              style={styles.iconPillBtn}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <Ionicons
                name={
                  boardLayout === 'vertical'
                    ? 'reorder-four-outline'
                    : 'albums-outline'
                }
                size={19}
                color={theme.accent}
              />
            </TouchableOpacity>

            {boardLayout === 'horizontal' && (
              <TouchableOpacity
                onPress={handleCycleColumnWidth}
                style={styles.iconPillBtn}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Ionicons
                  name="resize-outline"
                  size={18}
                  color={theme.accent}
                />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => setShowSearchBar((prev) => !prev)}
              style={styles.iconPillBtn}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <Ionicons
                name="search-outline"
                size={19}
                color={
                  showSearchBar || searchQuery ? theme.accent : theme.text
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={syncWithGoogle}
              disabled={syncState === 'syncing'}
              style={styles.iconPillBtn}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <Ionicons
                name="sync-outline"
                size={19}
                color={syncState === 'syncing' ? theme.subtext : theme.text}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={styles.iconPillBtn}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <Ionicons
                name="ellipsis-horizontal-circle-outline"
                size={21}
                color={theme.text}
              />
            </TouchableOpacity>
          </View>
        </View>

        <SyncStatusBadge
          isConnected={isConnected}
          syncState={syncState}
          pendingCount={stats.pendingCount}
          errorMessage={error}
          onRetry={() => { void syncWithGoogle(); }}
        />
      </View>

      <View style={[styles.viewPicker, { backgroundColor: theme.pillBg }]}>
        {(['Board', 'Kalender', 'Dokumente'] as const).map((label) => {
          const active = label === 'Board';
          return <TouchableOpacity key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => label === 'Kalender' ? router.push('/calendar') : label === 'Dokumente' ? router.push('/documents') : setDueFilter('all')} style={[styles.viewOption, { backgroundColor: active ? theme.surface : 'transparent' }]}>
            <Text style={{ color: active ? theme.text : theme.subtext, fontWeight: '600', fontSize: 14 }}>{label}</Text>
          </TouchableOpacity>;
        })}
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 8 }}>
        {([{ title: 'Suche', route: '/search' }, { title: 'Projekte', route: '/projects' }, { title: 'Verlauf', route: '/history' }, { title: 'Fokus', route: '/focus' }] as const).map(item => <TouchableOpacity key={item.route} accessibilityRole="button" onPress={() => router.push(item.route)} style={{ flex: 1, paddingVertical: 9, borderRadius: 12, backgroundColor: theme.pillBg, alignItems: 'center' }}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{item.title}</Text></TouchableOpacity>)}
      </View>
      <UndoBanner />
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
            <Text style={[styles.connectButtonText, { color: theme.onAccent ?? '#FFFFFF' }]}>Einstellungen öffnen</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {error && syncState !== 'error' ? (
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
        columnWidth={columnWidth}
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

      {/* Column Width Quick Toggle Toast Pill */}
      {widthToast && (
        <View style={styles.toastContainer} pointerEvents="none">
          <View
            style={[
              styles.toastPill,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(30, 41, 59, 0.92)'
                  : 'rgba(255, 255, 255, 0.94)',
                borderColor: theme.glassBorderBright,
              },
            ]}
          >
            <Ionicons name="resize-outline" size={15} color={theme.accent} />
            <Text style={[styles.toastText, { color: theme.text }]}>
              Spaltenbreite: {widthToast}
            </Text>
          </View>
        </View>
      )}

      {/* Apple-style Quick Capture Floating Button */}
      {visibleLists.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleQuickAddTask}
          style={[styles.fab, { backgroundColor: theme.accent }]}
        >
          <Ionicons name="add" size={28} color={theme.onAccent ?? '#FFFFFF'} />
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
  viewPicker: { flexDirection: 'row', borderRadius: 12, marginHorizontal: 16, marginTop: 8, marginBottom: 12, padding: 4 },
  viewOption: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
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
    paddingTop: 8,
    paddingBottom: 6,
  },
  headerNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  plannerTitle: {
    flex: 1,
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  actionCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 1,
    borderWidth: StyleSheet.hairlineWidth * 1.5,
    overflow: 'hidden',
  },
  iconPillBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
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
  toastContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  toastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
