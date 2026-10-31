import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTheme } from '../hooks/useTheme';
import { useKanbanStore } from '../stores/useKanbanStore';
import { COLUMN_PALETTE } from '../db/taskListRepo';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * iOS 27 "Liquid Glass" Ambient Mesh & Specular Refraction Backdrop.
 * Renders dynamic glowing color orbs derived from the user's active Kanban lists
 * diffused through a native iOS UIVisualEffectView blur layer.
 */
export function LiquidGlassBackground() {
  const theme = useTheme();
  const taskLists = useKanbanStore((s) => s.taskLists);

  if (!theme.isGlass) {
    return null;
  }

  const visibleLists = taskLists.filter((l) => l.isVisible);
  const orb1 = visibleLists[0]?.color || COLUMN_PALETTE[0]; // Blue
  const orb2 = visibleLists[1]?.color || '#8B5CF6'; // Violet
  const orb3 = visibleLists[2]?.color || '#06B6D4'; // Cyan
  const orb4 = visibleLists[3]?.color || '#EC4899'; // Pink

  const baseColors: [string, string, string] = theme.isDark
    ? ['#040714', '#0B122C', '#120B29']
    : ['#D8E6FF', '#EDE4FF', '#D6F4FF'];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Deep Fluid Base Gradient */}
      <LinearGradient
        colors={baseColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Ambient Color Orbs that refract through the Glass Columns & Cards */}
      <View
        style={[
          styles.orb,
          {
            width: SCREEN_W * 0.9,
            height: SCREEN_W * 0.9,
            borderRadius: SCREEN_W * 0.45,
            backgroundColor: orb1,
            top: -SCREEN_W * 0.2,
            left: -SCREEN_W * 0.2,
            opacity: theme.isDark ? 0.34 : 0.42,
          },
        ]}
      />

      <View
        style={[
          styles.orb,
          {
            width: SCREEN_W * 0.85,
            height: SCREEN_W * 0.85,
            borderRadius: SCREEN_W * 0.425,
            backgroundColor: orb2,
            top: SCREEN_H * 0.18,
            right: -SCREEN_W * 0.25,
            opacity: theme.isDark ? 0.3 : 0.38,
          },
        ]}
      />

      <View
        style={[
          styles.orb,
          {
            width: SCREEN_W * 0.95,
            height: SCREEN_W * 0.95,
            borderRadius: SCREEN_W * 0.475,
            backgroundColor: orb3,
            bottom: SCREEN_H * 0.08,
            left: -SCREEN_W * 0.25,
            opacity: theme.isDark ? 0.26 : 0.36,
          },
        ]}
      />

      <View
        style={[
          styles.orb,
          {
            width: SCREEN_W * 0.75,
            height: SCREEN_W * 0.75,
            borderRadius: SCREEN_W * 0.375,
            backgroundColor: orb4,
            bottom: -SCREEN_W * 0.15,
            right: -SCREEN_W * 0.1,
            opacity: theme.isDark ? 0.28 : 0.34,
          },
        ]}
      />

      {/* Native iOS Ultra-Smooth Diffusion Layer */}
      <BlurView
        intensity={theme.isDark ? 80 : 75}
        tint={theme.isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
  },
});
