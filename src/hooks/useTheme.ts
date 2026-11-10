import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { useKanbanStore } from '../stores/useKanbanStore';
import { getNewDesign } from '../designs/presets';

export const ThemeArea=createContext<'board'|'calendar'|'notes'|'documents'>('board');
export type DesignPreset = 'apple' | 'things' | 'linear' | 'oled' | 'studio' | 'paper' | 'midnight' | 'contrast';

export interface ThemeColors {
  isDark: boolean;
  isGlass: boolean;
  preset: DesignPreset;
  background: string;
  surface: string;
  columnBg: string;
  cardBg: string;
  cardBorder: string;
  glassBorderBright: string;
  glassBorderDim: string;
  glassSheenStart: string;
  glassSheenEnd: string;
  text: string;
  subtext: string;
  border: string;
  inputBg: string;
  accent: string;
  onAccent?: string;
  pillBg: string;
  cardRadius: number;
  columnRadius: number;
  showCardBorder: boolean;
  useCircularCheckbox: boolean;
  tintColumns: boolean;
  cardPadding?: number;
  cardGap?: number;
  headingFont?: string;
  titleSize?: number;
  cardShadowOpacity?: number;
}

export function useTheme(): ThemeColors {
  const area=useContext(ThemeArea);
  const systemScheme = useColorScheme();
  const themeMode = useKanbanStore((s) => s.themeMode);
  const designPreset = useKanbanStore((s) => s.designPreset);

  const isDark =
    designPreset === 'oled' ||
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark');

  const newDesign = getNewDesign(designPreset, isDark, area);
  if (newDesign) return newDesign;

  // 1. OLED Pure Black (iPhone Pro Display Look)
  if (designPreset === 'oled') {
    return {
      isDark: true,
      isGlass: false,
      preset: 'oled',
      background: '#000000',
      surface: '#0B0B0F',
      columnBg: '#0E0F14',
      cardBg: '#161821',
      cardBorder: '#262936',
      glassBorderBright: 'rgba(255,255,255,0.18)',
      glassBorderDim: 'rgba(255,255,255,0.06)',
      glassSheenStart: 'rgba(255,255,255,0.06)',
      glassSheenEnd: 'rgba(255,255,255,0.0)',
      text: '#F8FAFC',
      subtext: '#94A3B8',
      border: '#1E202B',
      inputBg: '#161821',
      accent: '#38BDF8',
      pillBg: '#181A24',
      cardRadius: 18,
      columnRadius: 24,
      showCardBorder: true,
      useCircularCheckbox: true,
      tintColumns: true,
    };
  }

  // 2. Things 3 Warm Craft Look
  if (designPreset === 'things') {
    if (isDark) {
      return {
        isDark: true,
        isGlass: false,
        preset: 'things',
        background: '#14161B',
        surface: '#1C1F26',
        columnBg: '#1D2028',
        cardBg: '#262A35',
        cardBorder: '#353B49',
        glassBorderBright: 'rgba(255,255,255,0.15)',
        glassBorderDim: 'rgba(255,255,255,0.05)',
        glassSheenStart: 'rgba(255,255,255,0.05)',
        glassSheenEnd: 'rgba(255,255,255,0.0)',
        text: '#F3F4F6',
        subtext: '#9CA3AF',
        border: '#2E333E',
        inputBg: '#252932',
        accent: '#3B82F6',
        pillBg: '#252932',
        cardRadius: 14,
        columnRadius: 20,
        showCardBorder: true,
        useCircularCheckbox: false,
        tintColumns: true,
      };
    }
    return {
      isDark: false,
      isGlass: false,
      preset: 'things',
      background: '#F7F6F2',
      surface: '#FFFFFF',
      columnBg: '#EFECE6',
      cardBg: '#FFFFFF',
      cardBorder: '#E5E0D8',
      glassBorderBright: 'rgba(255,255,255,0.8)',
      glassBorderDim: 'rgba(0,0,0,0.06)',
      glassSheenStart: 'rgba(255,255,255,0.4)',
      glassSheenEnd: 'rgba(255,255,255,0.0)',
      text: '#1C1E21',
      subtext: '#78756F',
      border: '#E5E0D8',
      inputBg: '#FFFFFF',
      accent: '#2563EB',
      pillBg: '#EAE6DF',
      cardRadius: 14,
      columnRadius: 20,
      showCardBorder: true,
      useCircularCheckbox: false,
      tintColumns: false,
    };
  }

  // 3. Linear Ultra-Clean Minimal
  if (designPreset === 'linear') {
    if (isDark) {
      return {
        isDark: true,
        isGlass: false,
        preset: 'linear',
        background: '#090A0F',
        surface: '#10121A',
        columnBg: '#12141D',
        cardBg: '#191C28',
        cardBorder: '#282D3E',
        glassBorderBright: 'rgba(255,255,255,0.14)',
        glassBorderDim: 'rgba(255,255,255,0.04)',
        glassSheenStart: 'rgba(255,255,255,0.04)',
        glassSheenEnd: 'rgba(255,255,255,0.0)',
        text: '#F1F5F9',
        subtext: '#8A8F98',
        border: '#222634',
        inputBg: '#17181C',
        accent: '#6366F1',
        pillBg: '#1B1E2B',
        cardRadius: 12,
        columnRadius: 16,
        showCardBorder: true,
        useCircularCheckbox: false,
        tintColumns: true,
      };
    }
    return {
      isDark: false,
      isGlass: false,
      preset: 'linear',
      background: '#F4F6F9',
      surface: '#FFFFFF',
      columnBg: '#EDF0F5',
      cardBg: '#FFFFFF',
      cardBorder: '#DFE3EB',
      glassBorderBright: 'rgba(255,255,255,0.8)',
      glassBorderDim: 'rgba(0,0,0,0.06)',
      glassSheenStart: 'rgba(255,255,255,0.3)',
      glassSheenEnd: 'rgba(255,255,255,0.0)',
      text: '#0F172A',
      subtext: '#64748B',
      border: '#E2E8F0',
      inputBg: '#FFFFFF',
      accent: '#6366F1',
      pillBg: '#E6EAF0',
      cardRadius: 12,
      columnRadius: 16,
      showCardBorder: true,
      useCircularCheckbox: false,
      tintColumns: true,
    };
  }

  // 4. Default ('apple'): Native iOS Glass (Refined for iPhone 15 Pro Max Super Retina XDR)
  if (isDark) {
    return {
      isDark: true,
      isGlass: true,
      preset: 'apple',
      background: '#000000',
      surface: 'rgba(18, 22, 34, 0.75)',
      columnBg: 'rgba(20, 26, 42, 0.48)',
      cardBg: 'rgba(255, 255, 255, 0.06)',
      cardBorder: 'rgba(255, 255, 255, 0.10)',
      glassBorderBright: 'rgba(255, 255, 255, 0.16)',
      glassBorderDim: 'rgba(255, 255, 255, 0.05)',
      glassSheenStart: 'rgba(255, 255, 255, 0.09)',
      glassSheenEnd: 'rgba(255, 255, 255, 0.0)',
      text: '#F8FAFC',
      subtext: '#94A3B8',
      border: 'rgba(255, 255, 255, 0.10)',
      inputBg: 'rgba(20, 26, 42, 0.70)',
      accent: '#0A84FF',
      pillBg: 'rgba(255, 255, 255, 0.08)',
      cardRadius: 16,
      columnRadius: 22,
      showCardBorder: true,
      useCircularCheckbox: true,
      tintColumns: true,
    };
  }

  return {
    isDark: false,
    isGlass: true,
    preset: 'apple',
    background: '#F2F2F7',
    surface: 'rgba(255, 255, 255, 0.85)',
    columnBg: 'rgba(255, 255, 255, 0.60)',
    cardBg: 'rgba(255, 255, 255, 0.88)',
    cardBorder: 'rgba(0, 0, 0, 0.06)',
    glassBorderBright: 'rgba(255, 255, 255, 0.90)',
    glassBorderDim: 'rgba(0, 0, 0, 0.05)',
    glassSheenStart: 'rgba(255, 255, 255, 0.40)',
    glassSheenEnd: 'rgba(255, 255, 255, 0.0)',
    text: '#000000',
    subtext: '#6E6E73',
    border: 'rgba(0, 0, 0, 0.08)',
    inputBg: '#FFFFFF',
    accent: '#007AFF',
    pillBg: 'rgba(0, 0, 0, 0.05)',
    cardRadius: 16,
    columnRadius: 22,
    showCardBorder: true,
    useCircularCheckbox: true,
    tintColumns: true,
  };
}
