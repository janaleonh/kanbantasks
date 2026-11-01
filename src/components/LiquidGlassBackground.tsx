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
    ? ['#000000', '#040711', '#080E1C']
    : ['#F8FAFC', '#F1F5F9', '#E8EEF5'];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Deep OLED Fluid Base Gradient */}
      <LinearGradient
        colors={baseColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle, Sophisticated Ambient Light Cones for Frosted Glass Refraction */}
      <View
        style={[
          styles.orb,
          {
            width: SCREEN_W * 0.9,
            height: SCREEN_W * 0.9,
            borderRadius: SCREEN_W * 0.45,
            backgroundColor: orb1,
            top: -SCREEN_W * 0.3,
            left: -SCREEN_W * 0.2,
            opacity: theme.isDark ? 0.12 : 0.16,
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
            top: SCREEN_H * 0.35,
            right: -SCREEN_W * 0.3,
            opacity: theme.isDark ? 0.10 : 0.14,
          },
        ]}
      />

      {/* Native iOS Ultra-Smooth Diffusion Layer */}
      <BlurView
        intensity={theme.isDark ? 90 : 80}
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
