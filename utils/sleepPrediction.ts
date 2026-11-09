/**
 * SleepLoop: on-device Ridge sleep prediction.
 * Mirrors the features, StandardScaler and Ridge(alpha=10) in ml/train.py.
 * Assumes the phone's time zone is Asia/Singapore, matching Python TIMEZONE.
 * No external ML package required.
 */
import type { SleepRecord } from "./sleepProcessing";

const MIN_TRAIN = 8;
const ALPHA = 10;
const MAX_GAP_DAYS = 7;
const DAY_MS = 86_400_000;

type Vector = number[];
export type SleepPrediction = {
  nightDate: string; // evening date; wake is usually the following morning
  predictedOnsetMinutes: number; // 23:30=1410, 00:30=1470
  predictedWakeMinutes: number; // clock minutes from midnight
  predictedDurationMinutes: number; // actual asleep minutes, not time in bed
  baselineOnsetMinutes: number;
  baselineWakeMinutes: number;
  baselineDurationMinutes: number;
  trainingExamples: number;
  daysSinceLastRecord: number;
};
export type PredictionResult =
  | { status: "ready"; prediction: SleepPrediction }
  | { status: "insufficient_data" | "stale_data" | "invalid_target"; reason: string };

type Night = { nightDate: string; onset: number; wake: number; duration: number };
type Example = { date: string; x: Vector; y: Vector };

function utcDayNumber(isoDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return NaN;
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== isoDate) return NaN;
  return Math.floor(ms / DAY_MS);
}
function dayGap(later: string, earlier: string): number {
  return utcDayNumber(later) - utcDayNumber(earlier);
}
function wakeWeekday(nightDate: string): number {
  // JS UTC Sunday=0; Python Monday=0. Wake date = nightDate + 1 day.
  const wakeDay = new Date((utcDayNumber(nightDate) + 1) * DAY_MS).getUTCDay();
  return (wakeDay + 6) % 7;
}
function clockMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}
function overnightMinutes(date: Date): number {
  const minutes = clockMinutes(date);
  return minutes < 720 ? minutes + 1440 : minutes;
}
function prepareNights(records: SleepRecord[]): Night[] {
  const byDate = new Map<string, Night>();
  // Stable ordering + keep first record per date, as Python drop_duplicates does.
  for (const r of records) {
    const onset = new Date(r.sleepOnset);
    const wake = new Date(r.wakeTime);
    if (!Number.isFinite(utcDayNumber(r.nightDate)) ||
        !Number.isFinite(onset.getTime()) || !Number.isFinite(wake.getTime()) ||
        !Number.isFinite(r.totalSleepMinutes) || r.totalSleepMinutes <= 0 ||
        r.totalSleepMinutes > 1440 || byDate.has(r.nightDate)) continue;
    byDate.set(r.nightDate, {
      nightDate: r.nightDate,
      onset: overnightMinutes(onset),
      wake: clockMinutes(wake),
      duration: r.totalSleepMinutes,
    });
  }
  return [...byDate.values()].sort((a, b) => a.nightDate.localeCompare(b.nightDate));
}
function features(date: string, previous: Night): Vector {
  const weekday = wakeWeekday(date);
  return [
    Math.sin((2 * Math.PI * weekday) / 7),
    Math.cos((2 * Math.PI * weekday) / 7),
    previous.onset,
    previous.wake,
    previous.duration,
    dayGap(date, previous.nightDate),
  ];
}
function examplesFrom(nights: Night[]): Example[] {
  const result: Example[] = [];
  for (let i = 1; i < nights.length; i++) {
    const gap = dayGap(nights[i].nightDate, nights[i - 1].nightDate);
    if (gap <= 0 || gap > MAX_GAP_DAYS) continue;
    result.push({
      date: nights[i].nightDate,
      x: features(nights[i].nightDate, nights[i - 1]),
      y: [nights[i].onset, nights[i].wake, nights[i].duration],
    });
  }
  return result;
}
function mean(values: number[]): number {
  return values.reduce((sum, x) => sum + x, 0) / values.length;
}

/** Gaussian elimination with partial pivoting; solves A * X = B. */
function solve(a: number[][], b: number[][]): number[][] {
  const n = a.length;
  const m = b[0].length;
  const matrix = a.map((row, i) => [...row, ...b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(matrix[r][col]) > Math.abs(matrix[pivot][col])) pivot = r;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-12) throw new Error("Ridge matrix is singular");
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const scale = matrix[col][col];
    for (let j = col; j < n + m; j++) matrix[col][j] /= scale;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = matrix[r][col];
      for (let j = col; j < n + m; j++) matrix[r][j] -= factor * matrix[col][j];
    }
  }
  return matrix.map(row => row.slice(n));
}

/** Multi-output Ridge with StandardScaler and an unpenalized intercept. */
function ridgePredict(train: Example[], x: Vector): Vector {
  const p = x.length;
  const q = train[0].y.length;
  const means = Array.from({ length: p }, (_, j) => mean(train.map(e => e.x[j])));
  const scales = Array.from({ length: p }, (_, j) => {
    const variance = mean(train.map(e => (e.x[j] - means[j]) ** 2));
    return variance > 0 ? Math.sqrt(variance) : 1; // sklearn StandardScaler
  });
  const yMeans = Array.from({ length: q }, (_, k) => mean(train.map(e => e.y[k])));
  const xtx = Array.from({ length: p }, () => Array(p).fill(0));
  const xty = Array.from({ length: p }, () => Array(q).fill(0));
  for (const e of train) {
    const z = e.x.map((value, j) => (value - means[j]) / scales[j]);
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) xtx[j][k] += z[j] * z[k];
      for (let k = 0; k < q; k++) xty[j][k] += z[j] * (e.y[k] - yMeans[k]);
    }
  }
  for (let j = 0; j < p; j++) xtx[j][j] += ALPHA;
  const coefficients = solve(xtx, xty);
  const z = x.map((value, j) => (value - means[j]) / scales[j]);
  return yMeans.map((intercept, k) =>
    intercept + z.reduce((sum, value, j) => sum + value * coefficients[j][k], 0)
  );
}

/**
 * Predict the sleep period beginning on targetNightDate (YYYY-MM-DD).
 * Example: Tuesday night 2026-11-10 predicts Wednesday morning's wake.
 */
export function predictUpcomingSleep(
  records: SleepRecord[],
  targetNightDate: string
): PredictionResult {
  if (!Number.isFinite(utcDayNumber(targetNightDate))) {
    return { status: "invalid_target", reason: "Target must be a valid YYYY-MM-DD date." };
  }
  const nights = prepareNights(records).filter(n => n.nightDate < targetNightDate);
  if (nights.length === 0) {
    return { status: "insufficient_data", reason: "No completed sleep records before the target night." };
  }
  const last = nights[nights.length - 1];
  const gap = dayGap(targetNightDate, last.nightDate);
  if (gap < 1) {
    return { status: "invalid_target", reason: "Target night must follow the latest recorded night." };
  }
  if (gap > MAX_GAP_DAYS) {
    return { status: "stale_data", reason: `Latest recorded night is ${gap} days before the target; maximum is ${MAX_GAP_DAYS}.` };
  }
  const examples = examplesFrom(nights);
  if (examples.length < MIN_TRAIN) {
    return { status: "insufficient_data", reason: `Only ${examples.length} usable training examples; need ${MIN_TRAIN}.` };
  }
  const baseline = [0, 1, 2].map(k => mean(examples.slice(-3).map(e => e.y[k])));
  const ridge = ridgePredict(examples, features(targetNightDate, last));
  return {
    status: "ready",
    prediction: {
      nightDate: targetNightDate,
      predictedOnsetMinutes: ridge[0],
      predictedWakeMinutes: ridge[1],
      predictedDurationMinutes: ridge[2],
      baselineOnsetMinutes: baseline[0],
      baselineWakeMinutes: baseline[1],
      baselineDurationMinutes: baseline[2],
      trainingExamples: examples.length,
      daysSinceLastRecord: gap,
    },
  };
}

/** Display minutes as a local clock time (e.g., 1470 -> 12:30 AM). */
export function formatPredictedTime(minutes: number): string {
  const rounded = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(rounded / 60);
  const minute = rounded % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
