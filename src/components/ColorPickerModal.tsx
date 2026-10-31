import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  PanResponder,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLUMN_PALETTE } from '../db/taskListRepo';
import { useTheme } from '../hooks/useTheme';

interface ColorPickerModalProps {
  visible: boolean;
  initialColor: string;
  listTitle: string;
  onClose: () => void;
  onSelectColor: (hexColor: string) => void;
}

// Convert HSL (h: 0-360, s: 0-100, l: 0-100) to #RRGGBB
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const HUE_STOPS = [
  '#FF0000',
  '#FF8000',
  '#FFFF00',
  '#00FF00',
  '#00FFFF',
  '#0080FF',
  '#0000FF',
  '#8000FF',
  '#FF00FF',
  '#FF0080',
  '#FF0000',
];

export function ColorPickerModal({
  visible,
  initialColor,
  listTitle,
  onClose,
  onSelectColor,
}: ColorPickerModalProps) {
  const theme = useTheme();
  const [hue, setHue] = useState(230);
  const [saturation, setSaturation] = useState(85);
  const [lightness, setLightness] = useState(58);
  const [hexInput, setHexInput] = useState(initialColor || '#6366F1');

  const trackWidthRef = useRef(280);

  useEffect(() => {
    if (visible && initialColor) {
      setHexInput(initialColor.toUpperCase());
    }
  }, [visible, initialColor]);

  const updateFromHSL = (nextH: number, nextS: number, nextL: number) => {
    const clampedH = Math.max(0, Math.min(360, Math.round(nextH)));
    const clampedS = Math.max(15, Math.min(100, Math.round(nextS)));
    const clampedL = Math.max(25, Math.min(80, Math.round(nextL)));
    setHue(clampedH);
    setSaturation(clampedS);
    setLightness(clampedL);
    setHexInput(hslToHex(clampedH, clampedS, clampedL));
  };

  const handleHueTouch = (e: GestureResponderEvent) => {
    const locX = e.nativeEvent.locationX;
    if (!Number.isFinite(locX)) return;
    const ratio = Math.max(0, Math.min(1, locX / trackWidthRef.current));
    updateFromHSL(ratio * 360, saturation, lightness);
  };

  const handleLightnessTouch = (e: GestureResponderEvent) => {
    const locX = e.nativeEvent.locationX;
    if (!Number.isFinite(locX)) return;
    const ratio = Math.max(0, Math.min(1, locX / trackWidthRef.current));
    updateFromHSL(hue, saturation, 25 + ratio * 55);
  };

  const handleSaturationTouch = (e: GestureResponderEvent) => {
    const locX = e.nativeEvent.locationX;
    if (!Number.isFinite(locX)) return;
    const ratio = Math.max(0, Math.min(1, locX / trackWidthRef.current));
    updateFromHSL(hue, 15 + ratio * 85, lightness);
  };

  const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(hexInput.trim());
  const previewColor = isValidHex ? hexInput.trim() : initialColor || '#6366F1';

  const handleSave = () => {
    onSelectColor(previewColor);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.cardBg, borderColor: theme.border },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View
                style={[styles.previewOrb, { backgroundColor: previewColor }]}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text }]}>
                  Listenfarbe frei wählen
                </Text>
                <Text
                  style={[styles.subtitle, { color: theme.subtext }]}
                  numberOfLines={1}
                >
                  {listTitle}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={26} color={theme.subtext} />
            </TouchableOpacity>
          </View>

          {/* Free Hue Slider */}
          <View style={styles.sliderSection}>
            <Text style={[styles.label, { color: theme.subtext }]}>
              FARBTON (STUFENLOS ZIEHEN)
            </Text>
            <View
              onLayout={(e) => {
                trackWidthRef.current = e.nativeEvent.layout.width || 280;
              }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleHueTouch}
              onResponderMove={handleHueTouch}
              style={styles.hueTrack}
            >
              {HUE_STOPS.map((stopColor, idx) => (
                <View
                  key={idx}
                  pointerEvents="none"
                  style={[styles.hueSegment, { backgroundColor: stopColor }]}
                />
              ))}
              <View
                pointerEvents="none"
                style={[
                  styles.sliderThumb,
                  {
                    left: `${(hue / 360) * 94}%`,
                    backgroundColor: hslToHex(hue, 90, 55),
                  },
                ]}
              />
            </View>
          </View>

          {/* Free Brightness / Lightness Slider */}
          <View style={styles.sliderSection}>
            <Text style={[styles.label, { color: theme.subtext }]}>
              HELLIGKEIT ({lightness}%)
            </Text>
            <View
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleLightnessTouch}
              onResponderMove={handleLightnessTouch}
              style={styles.hueTrack}
            >
              {[25, 35, 45, 55, 65, 75, 80].map((lVal, idx) => (
                <View
                  key={idx}
                  pointerEvents="none"
                  style={[
                    styles.hueSegment,
                    { backgroundColor: hslToHex(hue, saturation, lVal) },
                  ]}
                />
              ))}
              <View
                pointerEvents="none"
                style={[
                  styles.sliderThumb,
                  {
                    left: `${((lightness - 25) / 55) * 94}%`,
                    backgroundColor: previewColor,
                  },
                ]}
              />
            </View>
          </View>

          {/* Free Saturation Slider */}
          <View style={styles.sliderSection}>
            <Text style={[styles.label, { color: theme.subtext }]}>
              INTENSITÄT ({saturation}%)
            </Text>
            <View
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleSaturationTouch}
              onResponderMove={handleSaturationTouch}
              style={styles.hueTrack}
            >
              {[15, 30, 45, 60, 75, 90, 100].map((sVal, idx) => (
                <View
                  key={idx}
                  pointerEvents="none"
                  style={[
                    styles.hueSegment,
                    { backgroundColor: hslToHex(hue, sVal, lightness) },
                  ]}
                />
              ))}
              <View
                pointerEvents="none"
                style={[
                  styles.sliderThumb,
                  {
                    left: `${((saturation - 15) / 85) * 94}%`,
                    backgroundColor: previewColor,
                  },
                ]}
              />
            </View>
          </View>

          {/* Custom Hex Code Input */}
          <View style={styles.hexRow}>
            <Text style={[styles.label, { color: theme.subtext, marginBottom: 0 }]}>
              HEX-CODE:
            </Text>
            <TextInput
              style={[
                styles.hexInput,
                {
                  backgroundColor: theme.columnBg,
                  color: theme.text,
                  borderColor: previewColor,
                },
              ]}
              value={hexInput}
              onChangeText={(txt) =>
                setHexInput(txt.startsWith('#') ? txt : `#${txt}`)
              }
              maxLength={7}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          {/* Quick Swatches */}
          <View style={styles.swatchesGrid}>
            {[
              ...COLUMN_PALETTE,
              '#EC4899',
              '#14B8A6',
              '#8B5CF6',
              '#F97316',
              '#06B6D4',
              '#84CC16',
            ].map((swatch) => (
              <TouchableOpacity
                key={swatch}
                onPress={() => setHexInput(swatch)}
                style={[
                  styles.swatchBtn,
                  { backgroundColor: swatch },
                  previewColor.toUpperCase() === swatch.toUpperCase() &&
                    styles.swatchSelected,
                ]}
              />
            ))}
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: previewColor }]}
            onPress={handleSave}
          >
            <Text style={styles.saveBtnText}>Farbe übernehmen</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    gap: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  previewOrb: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  sliderSection: {
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  hueTrack: {
    height: 30,
    borderRadius: 15,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
  },
  hueSegment: {
    flex: 1,
    height: '100%',
  },
  sliderThumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  hexInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  swatchesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  swatchBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.12 }],
  },
  saveBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
