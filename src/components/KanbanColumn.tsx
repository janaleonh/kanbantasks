import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  TextInput,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { TaskCard } from './TaskCard';
import { ColorPickerModal } from './ColorPickerModal';
import type { Task } from '../db/taskRepo';
import { COLUMN_PALETTE, type TaskList } from '../db/taskListRepo';
import type { BoardLayout } from '../stores/useKanbanStore';
import { useTheme } from '../hooks/useTheme';

interface KanbanColumnProps {
  list: TaskList;
  tasks: Task[];
  layoutMode: BoardLayout;
  showCompletedByDefault: boolean;
  draggingTaskId: string | null;
  isDropTarget: boolean;
  isColumnDragging: boolean;
  isColumnDropTarget: boolean;
  onLayoutColumn?: (listId: string, y: number, height: number) => void;
  onAddTask: (listId: string, title: string) => void;
  onToggleTask: (id: string) => void;
  onEditTask: (task: Task) => void;
  onRenameList: (id: string, title: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onTaskStartDrag: (task: Task, pageX: number, pageY: number) => void;
  onColumnStartDrag: (list: TaskList, pageX: number, pageY: number) => void;
}

export function KanbanColumn({
  list,
  tasks,
  layoutMode,
  showCompletedByDefault,
  draggingTaskId,
  isDropTarget,
  isColumnDragging,
  isColumnDropTarget,
  onLayoutColumn,
  onAddTask,
  onToggleTask,
  onEditTask,
  onRenameList,
  onChangeColor,
  onTaskStartDrag,
  onColumnStartDrag,
}: KanbanColumnProps) {
  const theme = useTheme();
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(list.title);
  const [showCompleted, setShowCompleted] = useState(showCompletedByDefault);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  useEffect(() => {
    setShowCompleted(showCompletedByDefault);
  }, [showCompletedByDefault]);

  useEffect(() => {
    setEditTitle(list.title);
  }, [list.title]);

  const columnColor =
    list.color || COLUMN_PALETTE[list.position % COLUMN_PALETTE.length];

  const handleAddTask = useCallback(() => {
    const trimmed = newTaskTitle.trim();
    if (trimmed) {
      onAddTask(list.id, trimmed);
      setNewTaskTitle('');
      setIsAdding(false);
    }
  }, [newTaskTitle, list.id, onAddTask]);

  const handleRename = useCallback(() => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== list.title) {
      onRenameList(list.id, trimmed);
    } else {
      setEditTitle(list.title);
    }
    setIsEditingTitle(false);
  }, [editTitle, list.id, list.title, onRenameList]);

  const handleHeaderLongPress = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.pageX || 150;
    const y = e.nativeEvent.pageY || 120;
    onColumnStartDrag(list, x, y);
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    onLayoutColumn?.(list.id, y, height);
  };

  const activeTasks = tasks.filter((t) => t.status === 'needsAction');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const totalCount = tasks.length;
  const progressRatio = totalCount > 0 ? completedTasks.length / totalCount : 0;
  const isVertical = layoutMode === 'vertical';
  const isHighlighted = isDropTarget || isColumnDropTarget;

  const taskContent = (
    <>
      {activeTasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          accentColor={columnColor}
          isDragging={draggingTaskId === task.id}
          onToggle={onToggleTask}
          onEdit={onEditTask}
          onStartDrag={onTaskStartDrag}
        />
      ))}

      {/* Add Task inline */}
      {isAdding ? (
        <View
          style={[
            styles.addTaskForm,
            {
              backgroundColor: theme.inputBg,
              borderRadius: theme.cardRadius,
              borderColor: columnColor,
            },
          ]}
        >
          <TextInput
            style={[
              styles.addTaskInput,
              { color: theme.text, borderBottomColor: theme.border },
            ]}
            placeholder="Neue Aufgabe..."
            placeholderTextColor={theme.subtext}
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            onSubmitEditing={handleAddTask}
            autoFocus
            returnKeyType="done"
          />
          <View style={styles.addTaskActions}>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: columnColor }]}
              onPress={handleAddTask}
            >
              <Text style={styles.addButtonText}>Hinzufügen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setIsAdding(false);
                setNewTaskTitle('');
              }}
            >
              <Text style={[styles.cancelButtonText, { color: theme.subtext }]}>
                Abbrechen
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.addTaskTrigger,
            {
              backgroundColor: theme.isGlass
                ? theme.isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(255,255,255,0.45)'
                : theme.isDark
                ? columnColor + '18'
                : '#FFFFFFB8',
              borderTopColor: theme.glassBorderBright,
              borderLeftColor: theme.glassBorderBright,
              borderRightColor: theme.glassBorderDim,
              borderBottomColor: theme.glassBorderDim,
            },
          ]}
          onPress={() => setIsAdding(true)}
        >
          <Ionicons name="add-circle" size={20} color={columnColor} />
          <Text style={[styles.addTaskTriggerText, { color: theme.text }]}>
            Aufgabe hinzufügen
          </Text>
        </TouchableOpacity>
      )}

      {/* Collapsible Completed Tasks Section */}
      {completedTasks.length > 0 && (
        <View
          style={[
            styles.completedSection,
            { borderTopColor: theme.border },
          ]}
        >
          <TouchableOpacity
            style={styles.completedToggle}
            onPress={() => setShowCompleted((prev) => !prev)}
          >
            <Ionicons
              name={showCompleted ? 'chevron-down' : 'chevron-forward'}
              size={14}
              color={theme.subtext}
            />
            <Text style={[styles.completedHeader, { color: theme.subtext }]}>
              Erledigt ({completedTasks.length})
            </Text>
          </TouchableOpacity>

          {showCompleted &&
            completedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                accentColor={columnColor}
                isDragging={draggingTaskId === task.id}
                onToggle={onToggleTask}
                onEdit={onEditTask}
                onStartDrag={onTaskStartDrag}
              />
            ))}
        </View>
      )}
    </>
  );

  return (
    <View
      onLayout={handleLayout}
      style={[
        isVertical ? styles.columnVertical : styles.columnHorizontal,
        {
          borderRadius: theme.columnRadius,
          backgroundColor: theme.isGlass
            ? 'transparent'
            : theme.tintColumns
            ? theme.isDark
              ? columnColor + '16'
              : columnColor + '12'
            : theme.columnBg,
          borderWidth: isHighlighted ? 2.5 : 1.2,
          borderTopColor: isHighlighted
            ? columnColor
            : theme.glassBorderBright,
          borderLeftColor: isHighlighted
            ? columnColor
            : theme.glassBorderBright,
          borderRightColor: isHighlighted
            ? columnColor
            : theme.glassBorderDim,
          borderBottomColor: isHighlighted
            ? columnColor
            : theme.glassBorderDim,
        },
        isColumnDragging && styles.columnDragging,
      ]}
    >
      {/* iOS 27 Liquid Glass Backdrop Blur + Specular Diagonal Sheen */}
      {theme.isGlass && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <BlurView
            intensity={theme.isDark ? 45 : 60}
            tint={
              theme.isDark
                ? 'systemChromeMaterialDark'
                : 'systemUltraThinMaterialLight'
            }
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[
              columnColor + (theme.isDark ? '28' : '22'),
              theme.glassSheenStart,
              theme.glassSheenEnd,
            ]}
            locations={[0, 0.35, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      {/* Glowing Specular Top Edge Reflection */}
      <LinearGradient
        colors={['transparent', columnColor, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topColorBar}
      />

      {/* Column Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => setIsColorPickerOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[
              styles.colorBadge,
              {
                backgroundColor: columnColor + '30',
                borderColor: theme.glassBorderBright,
              },
            ]}
          >
            <View
              style={[styles.colorDot, { backgroundColor: columnColor }]}
            />
          </TouchableOpacity>

          {isEditingTitle ? (
            <View style={styles.editTitleWrapper}>
              <TextInput
                style={[
                  styles.titleInput,
                  { color: theme.text, borderBottomColor: columnColor },
                ]}
                value={editTitle}
                onChangeText={setEditTitle}
                onBlur={handleRename}
                onSubmitEditing={handleRename}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
              />
            </View>
          ) : (
            <Pressable
              onPress={() => setIsEditingTitle(true)}
              onLongPress={handleHeaderLongPress}
              delayLongPress={200}
              style={styles.titleHitArea}
            >
              <Text
                style={[styles.title, { color: theme.text }]}
                numberOfLines={1}
              >
                {list.title}
              </Text>
              <Ionicons
                name="pencil"
                size={12}
                color={theme.subtext}
                style={{ opacity: 0.55 }}
              />
            </Pressable>
          )}

          <View style={styles.headerRight}>
            <Pressable
              onLongPress={handleHeaderLongPress}
              delayLongPress={150}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.colDragHandle}
            >
              <Ionicons
                name="reorder-two-outline"
                size={18}
                color={theme.subtext}
              />
            </Pressable>
            <View
              style={[
                styles.countBadge,
                {
                  backgroundColor: columnColor + '2E',
                  borderColor: theme.glassBorderBright,
                },
              ]}
            >
              <Text
                style={[
                  styles.countText,
                  { color: theme.isDark ? '#FFFFFF' : columnColor },
                ]}
              >
                {activeTasks.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Completion Progress Bar */}
        {totalCount > 0 && (
          <View style={styles.progressRow}>
            <View
              style={[
                styles.progressTrack,
                {
                  backgroundColor: theme.isDark
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(15,23,42,0.08)',
                },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(progressRatio * 100)}%`,
                    backgroundColor: columnColor,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: theme.subtext }]}>
              {completedTasks.length}/{totalCount}
            </Text>
          </View>
        )}
      </View>

      <ColorPickerModal
        visible={isColorPickerOpen}
        initialColor={columnColor}
        listTitle={list.title}
        onClose={() => setIsColorPickerOpen(false)}
        onSelectColor={(hex) => onChangeColor(list.id, hex)}
      />

      {/* Tasks Body */}
      {isVertical ? (
        <View style={styles.taskListContent}>{taskContent}</View>
      ) : (
        <ScrollView
          style={styles.taskList}
          contentContainerStyle={styles.taskListContent}
          showsVerticalScrollIndicator={false}
        >
          {taskContent}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  columnHorizontal: {
    width: 306,
    marginRight: 14,
    maxHeight: '100%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 6,
  },
  columnVertical: {
    width: '100%',
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 5,
  },
  columnDragging: {
    opacity: 0.35,
  },
  topColorBar: {
    height: 3.5,
    width: '100%',
  },
  header: {
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  colorBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
  },
  titleHitArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    paddingRight: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colDragHandle: {
    padding: 3,
  },
  title: {
    fontSize: 17.5,
    fontWeight: '800',
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  editTitleWrapper: {
    flex: 1,
    marginRight: 8,
  },
  titleInput: {
    fontSize: 17.5,
    fontWeight: '800',
    borderBottomWidth: 2,
    paddingBottom: 2,
  },
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 28,
    borderWidth: 1,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  progressTrack: {
    flex: 1,
    height: 4.5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  taskList: {
    flex: 1,
  },
  taskListContent: {
    padding: 12,
    paddingTop: 8,
    paddingBottom: 14,
  },
  completedSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  completedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    marginBottom: 8,
  },
  completedHeader: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  addTaskForm: {
    padding: 12,
    marginTop: 4,
    borderWidth: 1.5,
  },
  addTaskInput: {
    fontSize: 15,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  addTaskActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  addButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  addTaskTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
  },
  addTaskTriggerText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
