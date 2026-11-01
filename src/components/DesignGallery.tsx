import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getNewDesign, NEW_DESIGNS } from '../designs/presets';
import { useKanbanStore } from '../stores/useKanbanStore';
import { useTheme } from '../hooks/useTheme';

export function DesignGallery() {
  const theme = useTheme();
  const systemScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const selected = useKanbanStore((s) => s.designPreset);
  const mode = useKanbanStore((s) => s.themeMode);
  const setDesign = useKanbanStore((s) => s.setDesignPreset);
  const dark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const previewWidth = Math.min(340, Math.max(240, width - 72));

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: theme.text }]}>Ein neuer Look für deinen Alltag.</Text>
      <Text style={[styles.description, { color: theme.subtext }]}>Wische durch die Vorschauen und tippe auf deinen Favoriten.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
        {NEW_DESIGNS.map((design) => {
          const preview = getNewDesign(design.id, dark)!;
          const active = selected === design.id;
          return (
            <TouchableOpacity
              key={design.id}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${design.name}. ${design.description}${active ? ' Aktiv.' : ' Design auswählen.'}`}
              onPress={() => { setDesign(design.id).catch(() => Alert.alert('Design konnte nicht gespeichert werden', 'Bitte versuche es erneut.')); }}
              style={[styles.option, { width: previewWidth, borderColor: active ? preview.accent : theme.border, backgroundColor: preview.background }]}
            >
              <View style={styles.preview} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <View style={styles.previewNav}>
                  <Text style={[styles.eyebrow, { color: preview.subtext }]}>{design.tag}</Text>
                  <Ionicons name="ellipsis-horizontal" size={20} color={preview.subtext} />
                </View>
                <Text style={[styles.previewTitle, { color: preview.text, fontFamily: preview.headingFont, fontSize: preview.titleSize }]}>Mein Tag.</Text>
                <Text style={[styles.previewSubtitle, { color: preview.subtext }]}>Platz für das, was zählt.</Text>
                <View style={[styles.column, { backgroundColor: preview.columnBg, borderRadius: preview.columnRadius }]}>
                  <View style={styles.columnHeading}>
                    <View style={[styles.dot, { backgroundColor: preview.accent }]} />
                    <Text style={[styles.columnTitle, { color: preview.text }]}>Heute</Text>
                    <Text style={[styles.count, { color: preview.subtext }]}>02</Text>
                  </View>
                  {['Ideen für die neue Woche', 'Zeit für einen Spaziergang'].map((title, i) => (
                    <View key={title} style={{ backgroundColor: preview.cardBg, borderColor: preview.cardBorder, borderWidth: 1, borderRadius: preview.cardRadius, padding: preview.cardPadding, marginBottom: preview.cardGap }}>
                      <Text style={[styles.taskTitle, { color: preview.text }]}>{title}</Text>
                      {i === 0 && <Text style={[styles.taskNote, { color: preview.subtext }]}>Die besten Gedanken festhalten.</Text>}
                      {i === 0 && <Text style={[styles.taskDate, { color: preview.accent }]}>◷  Heute</Text>}
                    </View>
                  ))}
                  <Text style={[styles.add, { color: preview.accent }]}>+  Aufgabe hinzufügen</Text>
                </View>
              </View>
              <View style={[styles.caption, { borderTopColor: preview.border, backgroundColor: preview.surface }]}>
                <View style={styles.captionHeading}>
                  <Text style={[styles.name, { color: preview.text }]}>{design.name}</Text>
                  <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={active ? preview.accent : preview.subtext} />
                </View>
                <Text style={[styles.description, { color: preview.subtext }]}>{design.description}</Text>
                <Text style={[styles.select, { color: preview.accent }]}>{active ? 'Aktiv' : 'Design verwenden'}{design.id === 'midnight' ? ' · Immer dunkel' : ' · Hell & Dunkel'}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  heading: { fontSize: 23, fontWeight: '700', letterSpacing: -0.6, marginBottom: 8 },
  description: { fontSize: 13, lineHeight: 19 },
  gallery: { gap: 14, paddingVertical: 18 },
  option: { borderRadius: 22, borderWidth: 2, overflow: 'hidden' },
  preview: { padding: 16 },
  previewNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  previewTitle: { marginTop: 18, fontWeight: '700', letterSpacing: -1 },
  previewSubtitle: { fontSize: 12, marginTop: 4, marginBottom: 20 },
  column: { padding: 10 },
  columnHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 4, marginBottom: 10 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  columnTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  count: { fontSize: 11, fontVariant: ['tabular-nums'] },
  taskTitle: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  taskNote: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  taskDate: { fontSize: 10, fontWeight: '600', marginTop: 12 },
  add: { fontSize: 11, fontWeight: '600', padding: 4 },
  caption: { padding: 16, borderTopWidth: 1, flex: 1 },
  captionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  name: { fontSize: 19, fontWeight: '700' },
  select: { fontSize: 11, fontWeight: '700', marginTop: 12 },
});
