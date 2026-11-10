import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,

  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PlannerCalendar from '../src/components/PlannerCalendar';
import PlannerDocuments from '../src/components/PlannerDocuments';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { PlannerNotes } from '../src/components/PlannerNotes';
import { KanbanBoard } from '../src/components/KanbanBoard';
import { UndoBanner } from '../src/components/UndoBanner';
import { EditTaskModal } from '../src/components/EditTaskModal';
import { SyncStatusBadge } from '../src/components/SyncStatusBadge';
import { LiquidGlassBackground } from '../src/components/LiquidGlassBackground';
import { useKanbanStore } from '../src/stores/useKanbanStore';
import { useSyncOnReconnect } from '../src/hooks/useSyncOnReconnect';
import { BoardToday } from '../src/components/BoardToday';
import { ThemeArea, useTheme } from '../src/hooks/useTheme';
import { loadCachedUser, type GoogleUser } from '../src/auth/googleAuth';
import type { Task } from '../src/db/taskRepo';

import Animated, { useAnimatedStyle, withTiming, ReduceMotion } from 'react-native-reanimated';
import { useHorizontalPaging } from '../src/hooks/useHorizontalPaging';

const mainTabs = [
  { id: 'board', label: 'Board', icon: 'albums-outline' },
  { id: 'calendar', label: 'Kalender', icon: 'calendar-outline' },
  { id: 'notes', label: 'Notizen', icon: 'document-text-outline' },
  { id: 'documents', label: 'Dokumente', icon: 'folder-outline' },
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const [menuOpen,setMenuOpen]=useState(false);
  const [pickingList,setPickingList]=useState(false);
  const [compose,setCompose]=useState<{listId:string}>();
  const { widget, tab, noteFolder, createdTask } = useLocalSearchParams<{ widget?: string; tab?: string; noteFolder?: string; createdTask?:string }>();
  useEffect(()=>{if(!createdTask)return;const timer=setTimeout(()=>router.setParams({createdTask:''}),7000);return ()=>clearTimeout(timer);},[createdTask,router]);
  const calendarActive = tab === 'calendar' || tab === 'diary';
  const documentsActive = tab === 'documents';
  const notesActive = tab === 'notes';
  const boardActive = !calendarActive && !documentsActive && !notesActive;
  const [documentsVisited, setDocumentsVisited] = useState(documentsActive);
  useEffect(() => { if (documentsActive) setDocumentsVisited(true); }, [documentsActive]);
  const [calendarVisited, setCalendarVisited] = useState(calendarActive);
  useEffect(() => { if (calendarActive) setCalendarVisited(true); }, [calendarActive]);
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

  const handleQuickAddTask = () => {
    if (!visibleLists.length) {Alert.alert('Keine sichtbare Liste','Erstelle eine Liste oder blende eine vorhandene Liste ein.');return;}
    if (visibleLists.length===1) {setCompose({listId:visibleLists[0].id});return;}
    setPickingList(true);
    setMenuOpen(true);
  };

  const activeTab = calendarActive ? 'calendar' : notesActive ? 'notes' : documentsActive ? 'documents' : 'board';
  const openTab = useCallback((id: typeof mainTabs[number]['id']) => {
    if (id === activeTab) return;
    router.setParams({ tab: id, noteFolder: '' });
    if (id === 'board') setDueFilter('all');
  }, [activeTab, router, setDueFilter]);
  const boardActions = [
    {label:'Projekte',run:()=>router.push('/projects')},
    {label:'Verlauf',run:()=>router.push('/history')},
    {label:'Fokus',run:()=>router.push('/focus')},
    {label:boardLayout==='horizontal'?'Spalten untereinander anzeigen':'Spalten nebeneinander anzeigen',run:toggleLayout},
    ...(boardLayout==='horizontal'?[{label:'Spaltenbreite ändern',run:handleCycleColumnWidth}]:[]),
    {label:syncState==='syncing'?'Synchronisierung läuft …':'Mit Google synchronisieren',run:syncWithGoogle,disabled:syncState==='syncing'},
    {label:'Einstellungen',run:()=>router.push('/settings')},
  ];
  const tabIndex = mainTabs.findIndex(item => item.id === activeTab);
  const swipe = useHorizontalPaging(offset => {
    const next = mainTabs[tabIndex + offset];
    if (next) openTab(next.id);
  });
  const [dockWidth,setDockWidth]=useState(0);
  const segmentWidth=Math.max(0,dockWidth-10)/mainTabs.length;
  const selectionStyle=useAnimatedStyle(()=>({
    transform:[{translateX:withTiming(tabIndex*segmentWidth,{duration:180,reduceMotion:ReduceMotion.System})}],
  }));

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* iOS 27 Liquid Glass Ambient Refraction Backdrop */}
      <LiquidGlassBackground />

      {/* Board actions and connection issues */}
      <View style={styles.header} {...swipe}>
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
            {boardActive && <>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Aufgabe schnell erfassen" onPress={handleQuickAddTask} style={styles.iconPillBtn}>
              <Ionicons name="add-circle-outline" size={22} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel="Planner durchsuchen" onPress={() => router.push('/search')}
              style={styles.iconPillBtn}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <Ionicons
                name="search-outline"
                size={19}
                color={
                  theme.text
                }
              />
            </TouchableOpacity>

            </>}
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={boardActive?'Weitere Board-Aktionen':'Einstellungen'}
              onPress={() => boardActive ? (setPickingList(false),setMenuOpen(true)) : router.push('/settings')}
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

      {notesActive && <ThemeArea.Provider value="notes"><PlannerNotes key={noteFolder} initialFolder={noteFolder} /></ThemeArea.Provider>}
      {(calendarVisited || calendarActive) && <View style={{ flex: 1, display: calendarActive ? 'flex' : 'none' }}><ThemeArea.Provider value="calendar"><PlannerCalendar active={calendarActive} /></ThemeArea.Provider></View>}
      {(documentsVisited || documentsActive) && <View style={{ flex: 1, display: documentsActive ? 'flex' : 'none' }}><ThemeArea.Provider value="documents"><PlannerDocuments active={documentsActive} /></ThemeArea.Provider></View>}
      {boardActive && isLoading && !taskLists.length ? <View style={styles.loadingContainer}><ActivityIndicator color={theme.accent}/><Text style={{color:theme.subtext}}>Lade Erinnerungen…</Text></View> : <View style={{ flex: 1, display: boardActive ? 'flex' : 'none' }}>
      {boardActive && <BoardToday tasks={visibleLists.flatMap(list=>tasksByList[list.id]??[])} onEdit={handleEditTask}/>}
      {!!createdTask && <TouchableOpacity accessibilityRole="button" onPress={()=>{router.setParams({createdTask:''});router.push({pathname:'/task',params:{id:createdTask}});}} style={{padding:12,backgroundColor:theme.pillBg}}><Text style={{color:theme.accent}}>Aufgabe erstellt · Öffnen</Text></TouchableOpacity>}
      <UndoBanner />
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
        compose={compose}
        taskLists={visibleLists}
        tasksByList={tasksByList}
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
      </View>}
      <View accessibilityRole="tablist" {...swipe} onLayout={e=>setDockWidth(e.nativeEvent.layout.width)} style={[styles.viewPicker, { backgroundColor:theme.pillBg,borderColor:theme.border }]}>
        {(theme.isGlass || theme.preset==='studio') && <BlurView pointerEvents="none" intensity={45} tint={theme.isDark?'dark':'light'} style={StyleSheet.absoluteFill}/>}
        {segmentWidth>0 && <Animated.View pointerEvents="none" style={[{position:'absolute',left:4,top:4,bottom:4,width:segmentWidth,borderRadius:19,backgroundColor:theme.surface},selectionStyle]}/>}

        {mainTabs.map(item => {
          const selected = item.id === activeTab;
          const color = selected ? theme.accent : theme.subtext;
          return <TouchableOpacity key={item.id} accessibilityRole="tab" accessibilityState={{selected}}
            onPress={() => openTab(item.id)} style={styles.viewOption}>
            <Ionicons name={item.icon} size={21} color={color}/>
            <Text style={{color,fontWeight:selected?'700':'500',fontSize:12}}>{item.label}</Text>
          </TouchableOpacity>;
        })}
      </View>
      <Modal visible={boardActive && menuOpen} transparent animationType="fade" onRequestClose={()=>setMenuOpen(false)}>
        <View style={{flex:1,justifyContent:'center',paddingHorizontal:24,paddingVertical:32}}>
          <Pressable accessible={false} onPress={()=>setMenuOpen(false)} style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(0,0,0,0.4)'}]}/>
          <View accessibilityViewIsModal style={{maxHeight:'100%',borderRadius:18,padding:14,backgroundColor:theme.cardBg}}>
            <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
              <Text accessibilityRole="header" style={{fontSize:19,fontWeight:'700',color:theme.text}}>{pickingList?'Aufgabe in welcher Liste?':'Board-Aktionen'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Menü schließen" onPress={()=>setMenuOpen(false)} style={{padding:12}}>
                <Ionicons name="close" size={22} color={theme.text}/>
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">{pickingList ? visibleLists.map(list=><TouchableOpacity accessibilityRole="button" key={list.id} onPress={()=>{setMenuOpen(false);setCompose({listId:list.id});}} style={{padding:14}}><Text style={{color:theme.text}}>{list.title}</Text></TouchableOpacity>) : boardActions.map(action=>
              <TouchableOpacity key={action.label} accessibilityRole="button" disabled={action.disabled} accessibilityState={{disabled:!!action.disabled}}
                onPress={()=>{setMenuOpen(false);void action.run();}} style={{minHeight:44,justifyContent:'center',paddingHorizontal:8}}>
                <Text style={{color:action.disabled?theme.subtext:theme.text,fontSize:16}}>{action.label}</Text>
              </TouchableOpacity>)}</ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  viewPicker: { flexDirection: 'row', overflow:'hidden',borderWidth:1,borderRadius:24, marginHorizontal: 16, marginTop: 8, marginBottom: 2, padding: 4 },
  viewOption: { flex: 1, minHeight: 48, justifyContent: 'center', gap: 2, borderRadius: 9, alignItems: 'center' },
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
