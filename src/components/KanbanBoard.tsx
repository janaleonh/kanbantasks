import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { KanbanColumn } from './KanbanColumn';
import type { Task } from '../db/taskRepo';
import type { TaskList } from '../db/taskListRepo';
import { useKanbanStore, type BoardLayout } from '../stores/useKanbanStore';
import { useTheme } from '../hooks/useTheme';

const DEFAULT_COLUMN_WIDTH = 320;
const COLUMN_MARGIN = 14;
const BOARD_PADDING = 16;
const DELETE_ZONE_HEIGHT = 115;

interface KanbanBoardProps {
  taskLists: TaskList[];
  tasksByList: Record<string, Task[]>;
  layoutMode: BoardLayout;
  columnWidth?: number;
  showCompletedByDefault: boolean;
  onAddList: (title: string) => void;
  onRenameList: (id: string, title: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onReorderLists: (orderedIds: string[]) => void;
  onAddTask: (listId: string, title: string) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onMoveTask: (
    taskId: string,
    fromListId: string,
    toListId: string,
    toIndex: number
  ) => void;
  onEditTask: (task: Task) => void;
}

export function KanbanBoard({
  taskLists,
  tasksByList,
  layoutMode,
  columnWidth = DEFAULT_COLUMN_WIDTH,
  showCompletedByDefault,
  onAddList,
  onRenameList,
  onChangeColor,
  onReorderLists,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onMoveTask,
  onEditTask,
}: KanbanBoardProps) {
  const theme = useTheme();
  const scrollRef = useRef<any>(null);
  const scrollOffset = useRef({ x: 0, y: 0 });
  const boardTopY = useRef(120);
  const verticalLayouts = useRef<Record<string, { y: number; height: number }>>({});
  const taskLayouts = useRef<
    Record<string, Record<string, { y: number; height: number }>>
  >({});
  const columnHeaderHeights = useRef<Record<string, number>>({});
  const columnScrollOffsets = useRef<Record<string, number>>({});

  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<TaskList | null>(null);
  const [dragPos, setDragPos] = useState({ x: 180, y: 300 });
  const [targetListId, setTargetListId] = useState<string | null>(null);
  const [targetIndex, setTargetIndex] = useState<number>(0);
  const [isOverDeleteZone, setIsOverDeleteZone] = useState(false);

  const lastHoveredTarget = useRef<string | null>(null);
  const lastTargetIndexRef = useRef<number>(0);
  const wasOverDeleteRef = useRef(false);
  const isVertical = layoutMode === 'vertical';
  const columnStride = (columnWidth || DEFAULT_COLUMN_WIDTH) + COLUMN_MARGIN;

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffset.current = {
        x: e.nativeEvent.contentOffset.x,
        y: e.nativeEvent.contentOffset.y,
      };
    },
    []
  );

  const handleLayoutColumn = useCallback(
    (listId: string, y: number, height: number) => {
      verticalLayouts.current[listId] = { y, height };
    },
    []
  );

  const handleLayoutTask = useCallback(
    (listId: string, taskId: string, y: number, height: number) => {
      if (!taskLayouts.current[listId]) {
        taskLayouts.current[listId] = {};
      }
      taskLayouts.current[listId][taskId] = { y, height };
    },
    []
  );

  const handleLayoutHeader = useCallback((listId: string, height: number) => {
    columnHeaderHeights.current[listId] = height;
  }, []);

  const handleScrollColumn = useCallback((listId: string, scrollY: number) => {
    columnScrollOffsets.current[listId] = scrollY;
  }, []);

  const getInsertionIndex = useCallback(
    (listId: string, pageY: number): number => {
      const activeTasks = (tasksByList[listId] || []).filter(
        (t) => t.status === 'needsAction'
      );
      if (activeTasks.length === 0) return 0;

      const headerH = (columnHeaderHeights.current[listId] || 64) + 4;
      let relY = 0;

      if (isVertical) {
        const colTop = verticalLayouts.current[listId]?.y || 0;
        relY =
          pageY -
          boardTopY.current +
          scrollOffset.current.y -
          colTop -
          headerH;
      } else {
        const colScrollY = columnScrollOffsets.current[listId] || 0;
        relY = pageY - boardTopY.current - 10 - headerH + colScrollY;
      }

      const layoutsForList = taskLayouts.current[listId] || {};
      for (let i = 0; i < activeTasks.length; i++) {
        const t = activeTasks[i];
        const box = layoutsForList[t.id] || { y: i * 82, height: 72 };
        const midY = box.y + box.height / 2;
        if (relY < midY) {
          return i;
        }
      }
      return activeTasks.length;
    },
    [tasksByList, isVertical]
  );

  const getColumnAtPoint = useCallback(
    (pageX: number, pageY: number): TaskList | null => {
      if (taskLists.length === 0) return null;

      if (isVertical) {
        if (!Number.isFinite(pageY)) return null;
        const contentY = pageY - boardTopY.current + scrollOffset.current.y;
        for (const list of taskLists) {
          const box = verticalLayouts.current[list.id];
          if (box && contentY >= box.y && contentY <= box.y + box.height + 16) {
            return list;
          }
        }
        return taskLists[taskLists.length - 1] ?? null;
      }

      if (!Number.isFinite(pageX)) return null;
      const contentX = pageX + scrollOffset.current.x - BOARD_PADDING;
      const idx = Math.max(
        0,
        Math.min(taskLists.length - 1, Math.floor(contentX / columnStride))
      );
      return taskLists[idx] ?? null;
    },
    [taskLists, isVertical, columnStride]
  );

  const maybeAutoScroll = useCallback(
    (pageX: number, pageY: number) => {
      const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
      const edgeThreshold = 65;

      if (isVertical) {
        if (!Number.isFinite(pageY)) return;
        if (pageY > screenHeight - DELETE_ZONE_HEIGHT - 50) {
          const nextY = scrollOffset.current.y + 18;
          scrollRef.current?.scrollTo?.({ y: nextY, animated: false });
          scrollOffset.current.y = nextY;
        } else if (pageY < boardTopY.current + edgeThreshold && scrollOffset.current.y > 0) {
          const nextY = Math.max(0, scrollOffset.current.y - 18);
          scrollRef.current?.scrollTo?.({ y: nextY, animated: false });
          scrollOffset.current.y = nextY;
        }
      } else {
        if (!Number.isFinite(pageX)) return;
        if (pageX > screenWidth - edgeThreshold) {
          const nextX = scrollOffset.current.x + 18;
          scrollRef.current?.scrollTo?.({ x: nextX, animated: false });
          scrollOffset.current.x = nextX;
        } else if (pageX < edgeThreshold && scrollOffset.current.x > 0) {
          const nextX = Math.max(0, scrollOffset.current.x - 18);
          scrollRef.current?.scrollTo?.({ x: nextX, animated: false });
          scrollOffset.current.x = nextX;
        }
      }
    },
    [isVertical]
  );

  const handleTaskStartDrag = useCallback(
    (task: Task, pageX: number, pageY: number) => {
      const safeX = Number.isFinite(pageX) ? pageX : 180;
      const safeY = Number.isFinite(pageY) ? pageY : 300;
      const initialIdx = getInsertionIndex(task.listId, safeY);
      useKanbanStore.getState().setIsDragging(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      setDraggingTask(task);
      setDragPos({ x: safeX, y: safeY });
      setTargetListId(task.listId);
      setTargetIndex(initialIdx);
      lastHoveredTarget.current = task.listId;
      lastTargetIndexRef.current = initialIdx;
      setIsOverDeleteZone(false);
      wasOverDeleteRef.current = false;
    },
    [getInsertionIndex]
  );

  const handleColumnStartDrag = useCallback(
    (list: TaskList, pageX: number, pageY: number) => {
      const safeX = Number.isFinite(pageX) ? pageX : 180;
      const safeY = Number.isFinite(pageY) ? pageY : 120;
      useKanbanStore.getState().setIsDragging(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      setDraggingColumn(list);
      setDragPos({ x: safeX, y: safeY });
      setTargetListId(list.id);
      lastHoveredTarget.current = list.id;
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!draggingTask && !draggingColumn) return;
      const pageX = e.nativeEvent.pageX;
      const pageY = e.nativeEvent.pageY;
      if (!Number.isFinite(pageX) || !Number.isFinite(pageY)) return;

      setDragPos({ x: pageX, y: pageY });
      maybeAutoScroll(pageX, pageY);

      const screenHeight = Dimensions.get('window').height;

      if (draggingTask) {
        const overDelete = pageY > screenHeight - DELETE_ZONE_HEIGHT - 25;
        if (overDelete !== wasOverDeleteRef.current) {
          wasOverDeleteRef.current = overDelete;
          setIsOverDeleteZone(overDelete);
          Haptics.selectionAsync().catch(() => {});
        }

        if (!overDelete) {
          const col = getColumnAtPoint(pageX, pageY);
          if (col) {
            const newIdx = getInsertionIndex(col.id, pageY);
            const listChanged = col.id !== lastHoveredTarget.current;
            const idxChanged = newIdx !== lastTargetIndexRef.current;

            if (listChanged) {
              lastHoveredTarget.current = col.id;
              setTargetListId(col.id);
            }
            if (listChanged || idxChanged) {
              lastTargetIndexRef.current = newIdx;
              setTargetIndex(newIdx);
              Haptics.selectionAsync().catch(() => {});
            }
          }
        } else {
          setTargetListId(null);
        }
      } else if (draggingColumn) {
        const col = getColumnAtPoint(pageX, pageY);
        if (col && col.id !== lastHoveredTarget.current) {
          lastHoveredTarget.current = col.id;
          setTargetListId(col.id);
          Haptics.selectionAsync().catch(() => {});
        }
      }
    },
    [
      draggingTask,
      draggingColumn,
      getColumnAtPoint,
      getInsertionIndex,
      maybeAutoScroll,
    ]
  );

  const handleTouchEnd = useCallback(() => {
    if (draggingTask) {
      if (wasOverDeleteRef.current) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error
        ).catch(() => {});
        onDeleteTask(draggingTask.id);
      } else if (targetListId) {
        onMoveTask(
          draggingTask.id,
          draggingTask.listId,
          targetListId,
          lastTargetIndexRef.current
        );
      }
      setDraggingTask(null);
      setTargetListId(null);
      setTargetIndex(0);
      setIsOverDeleteZone(false);
      lastHoveredTarget.current = null;
      lastTargetIndexRef.current = 0;
      wasOverDeleteRef.current = false;
    } else if (draggingColumn) {
      if (targetListId && targetListId !== draggingColumn.id) {
        const currentIds = taskLists.map((l) => l.id);
        const fromIdx = currentIds.indexOf(draggingColumn.id);
        const toIdx = currentIds.indexOf(targetListId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const nextIds = [...currentIds];
          const [moved] = nextIds.splice(fromIdx, 1);
          nextIds.splice(toIdx, 0, moved);
          onReorderLists(nextIds);
        }
      }
      setDraggingColumn(null);
      setTargetListId(null);
      lastHoveredTarget.current = null;
    }
    useKanbanStore.getState().setIsDragging(false);
  }, [
    draggingTask,
    draggingColumn,
    targetListId,
    taskLists,
    onDeleteTask,
    onMoveTask,
    onReorderLists,
  ]);

  const handleAddList = useCallback(() => {
    Alert.prompt(
      'Neue Liste',
      'Name der neuen Google Tasks-Liste:',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Erstellen',
          onPress: (name?: string) => {
            if (name?.trim()) {
              onAddList(name.trim());
            }
          },
        },
      ],
      'plain-text',
      '',
      'default'
    );
  }, [onAddList]);

  const isAnyDragging = Boolean(draggingTask || draggingColumn);
  const safeLeft = Number.isFinite(dragPos.x) ? Math.max(12, dragPos.x - 130) : 40;
  const safeTop = Number.isFinite(dragPos.y) ? Math.max(20, dragPos.y - 110) : 120;

  return (
    <View
      style={styles.wrapper}
      onLayout={(e) => {
        boardTopY.current = e.nativeEvent.layout.y || 120;
      }}
      onTouchMove={isAnyDragging ? handleTouchMove : undefined}
      onTouchEnd={isAnyDragging ? handleTouchEnd : undefined}
      onTouchCancel={isAnyDragging ? handleTouchEnd : undefined}
      onMoveShouldSetResponderCapture={() => isAnyDragging}
      onStartShouldSetResponderCapture={() => isAnyDragging}
    >
      <ScrollView
        ref={scrollRef}
        horizontal={!isVertical}
        style={styles.board}
        contentContainerStyle={
          isVertical ? styles.boardContentVertical : styles.boardContentHorizontal
        }
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        decelerationRate={isVertical ? 'normal' : 'fast'}
        snapToInterval={isVertical ? undefined : columnStride}
        snapToAlignment="start"
        scrollEnabled={!isAnyDragging}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {taskLists.map((list) => (
          <KanbanColumn
            key={list.id}
            list={list}
            columnWidth={columnWidth}
            tasks={tasksByList[list.id] || []}
            layoutMode={layoutMode}
            showCompletedByDefault={showCompletedByDefault}
            draggingTaskId={draggingTask?.id ?? null}
            isDropTarget={
              Boolean(draggingTask) &&
              targetListId === list.id &&
              !isOverDeleteZone
            }
            dropInsertIndex={
              Boolean(draggingTask) &&
              targetListId === list.id &&
              !isOverDeleteZone
                ? targetIndex
                : null
            }
            isColumnDragging={draggingColumn?.id === list.id}
            isColumnDropTarget={
              Boolean(draggingColumn) && targetListId === list.id
            }
            onLayoutColumn={handleLayoutColumn}
            onLayoutTask={handleLayoutTask}
            onLayoutHeader={handleLayoutHeader}
            onScrollColumn={handleScrollColumn}
            onAddTask={onAddTask}
            onToggleTask={onToggleTask}
            onEditTask={onEditTask}
            onRenameList={onRenameList}
            onChangeColor={onChangeColor}
            onTaskStartDrag={handleTaskStartDrag}
            onColumnStartDrag={handleColumnStartDrag}
          />
        ))}

        {/* Add Column Button */}
        <TouchableOpacity
          style={[
            isVertical ? styles.addColumnVertical : styles.addColumnHorizontal,
            { backgroundColor: theme.columnBg, borderColor: theme.border },
          ]}
          onPress={handleAddList}
        >
          <Ionicons name="add-circle" size={32} color={theme.accent} />
          <Text style={[styles.addColumnText, { color: theme.text }]}>
            Neue Liste erstellen
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Floating Ghost Card while dragging a Task */}
      {draggingTask && (
        <View
          pointerEvents="none"
          style={[
            styles.floatingCard,
            {
              backgroundColor: theme.cardBg,
              left: safeLeft,
              top: safeTop,
              borderColor: isOverDeleteZone ? '#EF4444' : theme.accent,
            },
          ]}
        >
          <Text
            style={[styles.floatingTitle, { color: theme.text }]}
            numberOfLines={2}
          >
            {draggingTask.title}
          </Text>
          {targetListId && !isOverDeleteZone ? (
            <Text style={[styles.floatingTarget, { color: theme.accent }]}>
              {targetListId === draggingTask.listId
                ? `↕ Position ${targetIndex + 1} in „${
                    taskLists.find((l) => l.id === targetListId)?.title
                  }“`
                : `→ ${
                    taskLists.find((l) => l.id === targetListId)?.title
                  } (Position ${targetIndex + 1})`}
            </Text>
          ) : null}
        </View>
      )}

      {/* Floating Ghost Header while dragging a Column (List) */}
      {draggingColumn && (
        <View
          pointerEvents="none"
          style={[
            styles.floatingCard,
            {
              backgroundColor: theme.cardBg,
              left: safeLeft,
              top: safeTop,
              borderColor: '#A855F7',
            },
          ]}
        >
          <Text
            style={[styles.floatingTitle, { color: theme.text }]}
            numberOfLines={1}
          >
            Liste: {draggingColumn.title}
          </Text>
          {targetListId ? (
            <Text style={[styles.floatingTarget, { color: '#A855F7' }]}>
              Position tauschen mit:{' '}
              {taskLists.find((l) => l.id === targetListId)?.title}
            </Text>
          ) : null}
        </View>
      )}

      {/* Bottom Red Delete Drop Zone */}
      {draggingTask && (
        <View
          pointerEvents="none"
          style={[
            styles.deleteZone,
            isOverDeleteZone && styles.deleteZoneActive,
          ]}
        >
          <View style={styles.deleteZonePill}>
            <Ionicons
              name={isOverDeleteZone ? 'trash' : 'trash-outline'}
              size={isOverDeleteZone ? 26 : 22}
              color="#FFFFFF"
            />
            <Text style={styles.deleteZoneText}>
              {isOverDeleteZone
                ? 'Loslassen zum sofortigen Löschen'
                : 'Hierher ziehen zum Löschen'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  board: {
    flex: 1,
  },
  boardContentHorizontal: {
    paddingHorizontal: BOARD_PADDING,
    paddingVertical: 10,
  },
  boardContentVertical: {
    paddingHorizontal: BOARD_PADDING,
    paddingTop: 8,
    paddingBottom: 60,
  },
  addColumnHorizontal: {
    width: 220,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    minHeight: 180,
    gap: 8,
  },
  addColumnVertical: {
    width: '100%',
    borderRadius: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: 10,
  },
  addColumnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  floatingCard: {
    position: 'absolute',
    width: 260,
    borderRadius: 20,
    padding: 16,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.26,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 999,
  },
  floatingTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  floatingTarget: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  deleteZone: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DELETE_ZONE_HEIGHT,
    backgroundColor: 'rgba(239, 68, 68, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 14,
    zIndex: 900,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  deleteZoneActive: {
    backgroundColor: '#DC2626',
    height: DELETE_ZONE_HEIGHT + 16,
  },
  deleteZonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteZoneText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
