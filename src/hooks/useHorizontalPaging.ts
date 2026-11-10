import { useEffect, useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';

export function useHorizontalPaging(page: (offset: number) => void) {
  const latest = useRef(page);
  useEffect(() => { latest.current = page; }, [page]);
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => g.numberActiveTouches === 1 &&
      Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) >= 44 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6) {
        latest.current(g.dx < 0 ? 1 : -1);
      }
    },
  }).panHandlers, []);
}
