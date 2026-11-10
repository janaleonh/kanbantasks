export type Cycle = { starts: string[]; bleedingDays?: string[]; ends?: Record<string, string>; automatic?: boolean; length: number; bleeding: number };
const days = (key: string) => Date.parse(key + 'T00:00:00Z') / 86400000;
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a-b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2;
}

// Measure from first day to first day. UTC day numbers avoid DST offsets.
export function cycleStats(cycle: Cycle, asOf: string) {
  const starts = [...new Set(cycle.starts.filter(date => date <= asOf))].sort().slice(-7);
  const intervals = starts.slice(1).map((date, i) => days(date) - days(starts[i]));
  const usable = intervals.filter(n => n >= 16 && n <= 90);
  const typical = usable.length >= 2 ? Math.round(median(usable)) : null;
  const [a,b,c] = intervals.slice(-3);
  let trend = '';
  if (c !== undefined && [a,b,c].every(n => n >= 16 && n <= 90)) {
    if (a < b && b < c) trend = 'Die letzten drei Zyklen wurden jeweils länger.';
    else if (a > b && b > c) trend = 'Die letzten drei Zyklen wurden jeweils kürzer.';
    else if (a === b && b === c) trend = 'Die letzten drei Zyklen waren gleich lang.';
  }
  return { intervals, usable, typical, trend, length: cycle.automatic === false ? cycle.length : typical ?? cycle.length };
}

function validDate(date: string) {
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === date;
}

export function enterPeriod(cycle: Cycle, start: string, end: string | null, today: string, original: string | null = null): Cycle {
  if (!validDate(start) || start > today || (end !== null && (!validDate(end) || end < start || end > today)))
    throw new Error('Beginn und Ende müssen spätestens heute liegen. Das Ende muss am oder nach dem Beginn liegen.');
  const others = cycle.starts.filter(date => date !== original);
  if (others.some(date => date <= (end ?? start) && (cycle.ends?.[date] ?? date) >= start))
    throw new Error('Dieser Zeitraum überschneidet sich mit einer eingetragenen Periode.');
  const ends = {...cycle.ends};
  if (original) delete ends[original];
  if (end) ends[start] = end;
  return {...cycle, starts:[...others,start].sort(), ends};
}

export function cycleDay(cycle: Cycle | null, key: string) {
  if (!cycle) return null;
  const start = cycle.starts.filter(date => date <= key).sort().pop();
  if (!start) return null;
  const elapsed = days(key) - days(start);
  const { length } = cycleStats(cycle, key);
  const index = elapsed % length;
  const ovulation = length - 14;
  if (elapsed === 0) return 'Periodenbeginn · eingetragen';
  if (cycle.bleedingDays?.includes(key)) return 'Periode · eingetragen';
  const end = cycle.ends?.[start];
  if (end && key <= end) return 'Periode · eingetragen';
  if (index < cycle.bleeding && !(elapsed < length && end && key > end)) return 'Periode · geschätzt';
  if (index === ovulation) return 'Eisprung · geschätzt';
  if (index >= ovulation - 5 && index <= ovulation + 1) return 'Fruchtbare Tage · geschätzt';
  const remaining = length - index;
  return remaining <= 2 ? 'Periode voraussichtlich in ' + remaining + (remaining === 1 ? ' Tag' : ' Tagen') : null;
}

export function nextPeriod(cycle: Cycle, today: string) {
  const last = cycle.starts.filter(date => date <= today).sort().pop();
  if (!last) return null;
  const { length } = cycleStats(cycle, today);
  const cycles = Math.max(1, Math.ceil((days(today) - days(last)) / length));
  const next = days(last) + cycles * length;
  return new Date(next * 86400000).toISOString().slice(0, 10);
}
