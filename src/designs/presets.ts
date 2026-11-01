import type { DesignPreset, ThemeColors } from '../hooks/useTheme';

export const NEW_DESIGNS = [
  { id: 'studio', name: 'Studio', description: 'Klarer Fokus. Kompakte Karten, feine Linien und kräftiges Blau.', tag: 'KLAR & KOMPAKT' },
  { id: 'paper', name: 'Papier', description: 'Mehr Ruhe. Warme Naturtöne, großzügige Abstände und klare Systemschrift.', tag: 'WARM & RUHIG' },
  { id: 'midnight', name: 'Midnight', description: 'Dein Nachtstudio. Tiefes Grün, weiche Formen und frisches Mint.', tag: 'DUNKEL & FOKUSSIERT' },
] as const;

export function getNewDesign(preset: DesignPreset, dark: boolean): ThemeColors | null {
  if (preset !== 'studio' && preset !== 'paper' && preset !== 'midnight') return null;
  const isDark = preset === 'midnight' || dark;
  const paper = preset === 'paper';
  const midnight = preset === 'midnight';
  const palette = midnight
    ? ['#091714', '#10231E', '#142C25', '#204238', '#EDF8F1', '#A0BDAF', '#83E5B6', '#18372D']
    : paper
      ? isDark
        ? ['#201C18', '#2A241F', '#342C25', '#4D4237', '#F4EBDD', '#C1AF99', '#E5AD86', '#3D3228']
        : ['#F6F1E7', '#FFFDF7', '#EEE6D8', '#D8CDBB', '#302B24', '#756853', '#995235', '#E9DDCB']
      : isDark
        ? ['#11151E', '#1A2030', '#151B28', '#303C53', '#F2F5FC', '#A6B1C7', '#9CB8FF', '#26334E']
        : ['#F1F4FA', '#FFFFFF', '#E8EDF6', '#D4DDEB', '#192640', '#5E6E86', '#315DD5', '#E1E9FA'];
  const [background, surface, columnBg, border, text, subtext, accent, pillBg] = palette;
  return {
    preset, isDark, isGlass: false, background, surface, columnBg,
    cardBg: surface, cardBorder: border, border, text, subtext, accent,
    onAccent: isDark ? background : '#FFFFFF',
    inputBg: surface, pillBg,
    glassBorderBright: border, glassBorderDim: border,
    glassSheenStart: 'transparent', glassSheenEnd: 'transparent',
    cardRadius: paper ? 6 : midnight ? 22 : 10,
    columnRadius: paper ? 10 : midnight ? 28 : 14,
    showCardBorder: true, useCircularCheckbox: !paper, tintColumns: false,
    cardPadding: paper ? 18 : midnight ? 16 : 12,
    cardGap: paper ? 14 : midnight ? 12 : 8,
    headingFont: undefined,
    titleSize: paper ? 36 : midnight ? 32 : 30,
    cardShadowOpacity: midnight ? 0 : paper ? 0.035 : 0.025,
  };
}
