import type { DesignPreset, ThemeColors } from '../hooks/useTheme';

export const NEW_DESIGNS = [
  { id: 'studio', name: 'Ruhig & klar', description: 'Feine Linien, großzügige Abstände und eine gläserne Navigationsleiste.', tag: 'STUDIO' },
  { id: 'paper', name: 'Warm & persönlich', description: 'Mehr Ruhe. Warme Naturtöne, großzügige Abstände und klare Systemschrift.', tag: 'WARM & RUHIG' },
  { id: 'contrast', name: 'Kräftig & kontrastreich', description: 'Markante Titel und eigene Akzentfarben für Board, Kalender, Notizen und Dokumente.', tag: 'KONTRAST' },
  { id: 'midnight', name: 'Midnight', description: 'Dein Nachtstudio. Tiefes Grün, weiche Formen und frisches Mint.', tag: 'DUNKEL & FOKUSSIERT' },
] as const;

export function getNewDesign(preset: DesignPreset, dark: boolean, area: 'board'|'calendar'|'notes'|'documents' = 'board'): ThemeColors | null {
  if (preset !== 'studio' && preset !== 'paper' && preset !== 'midnight' && preset !== 'contrast') return null;
  const isDark = preset === 'midnight' || dark;
  const paper = preset === 'paper';
  const midnight = preset === 'midnight';
  const sectionColors=dark ? {board:'#ACB7FF',calendar:'#63E5CF',notes:'#EDADFF',documents:'#FFB484'} : {board:'#3036AA',calendar:'#006659',notes:'#78249D',documents:'#97410C'};
  const palette = preset==='contrast'
    ? (dark ? ['#101016','#202029','#191920','#555565','#FFFFFF','#CBCBD6',sectionColors[area],'#33333F'] : ['#F7F7FA','#FFFFFF','#EDEDF3','#A5A5B6','#121218','#454555',sectionColors[area],'#E4E4EF'])
    : midnight
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
    cardRadius: paper ? 18 : midnight ? 22 : 10,
    columnRadius: paper ? 22 : midnight ? 28 : 14,
    showCardBorder: true, useCircularCheckbox: !paper, tintColumns: false,
    cardPadding: paper ? 18 : midnight ? 16 : 16,
    cardGap: paper ? 14 : midnight ? 12 : 8,
    headingFont: undefined,
    titleSize: paper ? 36 : midnight ? 32 : 30,
    cardShadowOpacity: midnight ? 0 : paper ? 0.035 : 0.025,
  };
}
