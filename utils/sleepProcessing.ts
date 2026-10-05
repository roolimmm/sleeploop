/**
 * SleepLoop preprocessing pipeline (TypeScript)
 *
 * Purpose:
 *   Convert raw Apple Health / HealthKit sleep-stage records into
 *   nightly SleepRecord objects, then compute multi-night summary statistics.
 *
 * Notes:
 * - Core / Deep / REM / AsleepUnspecified are all treated simply as "asleep".
 * - Awake and InBed records are ignored.
 * - Overlapping asleep intervals are merged to avoid double-counting.
 * - A 12:00 noon boundary is currently used to group evening + following
 *   morning sleep into one night.
 * - The default insufficient-sleep threshold is 7 hours for the prototype.
 */

export const ASLEEP_VALUES = new Set([
  1, // HKCategoryValueSleepAnalysisAsleepCore
  3, // HKCategoryValueSleepAnalysisAsleepDeep
  4, // HKCategoryValueSleepAnalysisAsleepREM
  5, // HKCategoryValueSleepAnalysisAsleepUnspecified
]);

export type RawSleepRecord = {
  startDate: string | Date;
  endDate: string | Date;
  value: number;
  sourceName?: string;
};

export type SleepRecord = {
  nightDate: string;
  wakeDate: string;
  sleepOnset: Date;
  wakeTime: Date;
  totalSleepMinutes: number;
  totalSleepHours: number;
};

export type TimeStats = {
  earliest: Date;
  latest: Date;
  rangeMinutes: number;
  meanMinutes: number;
  medianMinutes: number;
  standardDeviationMinutes: number;
};

export type SleepSummary = {
  numberOfNights: number;

  sleepDuration: {
    averageHours: number;
    medianHours: number;
    shortestHours: number;
    longestHours: number;
    rangeHours: number;
  };

  bedtime: {
    average: string;
    median: string;
    earliest: string;
    latest: string;
    range: string;
    variabilitySdMinutes: number;
  };

  wakeTime: {
    average: string;
    median: string;
    earliest: string;
    latest: string;
    range: string;
    variabilitySdMinutes: number;
  };

  insufficientSleep: {
    thresholdHours: number;
    nightsBelowThreshold: number;
    percentageBelowThreshold: number;

    averageBedtimeShortNights: string;
    averageBedtimeSufficientNights: string;
    bedtimeDifferenceMinutes: number | null;
    bedtimeDifferenceText: string;

    averageWakeShortNights: string;
    averageWakeSufficientNights: string;
    wakeDifferenceMinutes: number | null;
    wakeDifferenceText: string;
  };
};

type Interval = {
  start: Date;
  end: Date;
};

function toDate(value: string | Date): Date {
  const d = value instanceof Date ? new Date(value) : new Date(value);

  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`);
  }

  return d;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Uses 12 noon as the current boundary between nights.
 *
 * Examples:
 *   11:30 PM on 1 Sep -> nightDate = 1 Sep
 *   02:00 AM on 2 Sep -> nightDate = 1 Sep
 */
export function getNightDate(start: Date): string {
  const d = new Date(start);

  if (d.getHours() < 12) {
    d.setDate(d.getDate() - 1);
  }

  return formatLocalDate(d);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  const merged: Interval[] = [];

  for (const current of sorted) {
    const last = merged[merged.length - 1];

    if (!last || current.start.getTime() > last.end.getTime()) {
      merged.push({
        start: new Date(current.start),
        end: new Date(current.end),
      });
    } else if (current.end.getTime() > last.end.getTime()) {
      last.end = new Date(current.end);
    }
  }

  return merged;
}

/**
 * Converts a clock time onto a continuous overnight timeline.
 *
 * Example:
 *   11:30 PM -> 1410
 *   12:30 AM -> 1470
 *
 * This prevents midnight from making nearby sleep times appear far apart.
 */
function overnightMinutes(date: Date): number {
  const clockMinutes =
    date.getHours() * 60 +
    date.getMinutes() +
    date.getSeconds() / 60;

  return date.getHours() < 12
    ? clockMinutes + 24 * 60
    : clockMinutes;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, x) => sum + x, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function sampleStandardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;

  const avg = mean(values);
  const squaredDifferences = values.map((x) => (x - avg) ** 2);

  return Math.sqrt(
    squaredDifferences.reduce((sum, x) => sum + x, 0) /
      (values.length - 1)
  );
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatClockFromMinutes(minutes: number | null): string {
  if (minutes === null) return "";

  let rounded = Math.round(minutes) % (24 * 60);
  if (rounded < 0) rounded += 24 * 60;

  const hour24 = Math.floor(rounded / 60);
  const minute = rounded % 60;

  const hour12 = hour24 % 12 || 12;
  const suffix = hour24 < 12 ? "AM" : "PM";

  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatClock(date: Date): string {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return formatClockFromMinutes(minutes);
}

function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (hours > 0) {
    return `${hours} h ${mins} min`;
  }

  return `${mins} min`;
}

function calculateTimeStats(
  records: SleepRecord[],
  key: "sleepOnset" | "wakeTime"
): TimeStats {
  if (records.length === 0) {
    throw new Error("Cannot calculate time statistics for an empty dataset.");
  }

  const values = records.map((r) => overnightMinutes(r[key]));

  let earliestIndex = 0;
  let latestIndex = 0;

  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[earliestIndex]) earliestIndex = i;
    if (values[i] > values[latestIndex]) latestIndex = i;
  }

  return {
    earliest: records[earliestIndex][key],
    latest: records[latestIndex][key],
    rangeMinutes: Math.max(...values) - Math.min(...values),
    meanMinutes: mean(values),
    medianMinutes: median(values),
    standardDeviationMinutes: sampleStandardDeviation(values),
  };
}

function meanClock(
  records: SleepRecord[],
  key: "sleepOnset" | "wakeTime"
): number | null {
  if (records.length === 0) return null;

  return mean(records.map((r) => overnightMinutes(r[key])));
}

function differenceText(
  value: number | null,
  positiveWord: string,
  negativeWord: string
): string {
  if (value === null) return "";

  if (Math.abs(value) < 0.05) {
    return "No meaningful difference";
  }

  const direction = value > 0 ? positiveWord : negativeWord;
  const minutes = Math.abs(value);

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours} h ${mins} min ${direction}`;
  }

  return `${round(minutes, 1)} min ${direction}`;
}

/**
 * STEP 1:
 * Convert raw HealthKit sleep-stage records into one SleepRecord per night.
 */
export function buildNightlySleepRecords(
  rawRecords: RawSleepRecord[]
): SleepRecord[] {
  const groups = new Map<string, Interval[]>();

  for (const record of rawRecords) {
    if (!ASLEEP_VALUES.has(record.value)) {
      continue;
    }

    const start = toDate(record.startDate);
    const end = toDate(record.endDate);

    if (end.getTime() <= start.getTime()) {
      continue;
    }

    const key = getNightDate(start);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key)!.push({ start, end });
  }

  const output: SleepRecord[] = [];

  const sortedKeys = [...groups.keys()].sort();

  for (const key of sortedKeys) {
    const merged = mergeIntervals(groups.get(key)!);

    if (merged.length === 0) {
      continue;
    }

    const sleepOnset = merged[0].start;
    const wakeTime = merged[merged.length - 1].end;

    const totalSleepMinutes = merged.reduce((total, interval) => {
      return (
        total +
        (interval.end.getTime() - interval.start.getTime()) /
          (1000 * 60)
      );
    }, 0);

    output.push({
      nightDate: key,
      wakeDate: formatLocalDate(wakeTime),
      sleepOnset,
      wakeTime,
      totalSleepMinutes,
      totalSleepHours: totalSleepMinutes / 60,
    });
  }

  return output;
}

/**
 * Optional helper equivalent to the Python --start / --end filter.
 * Filtering is based on wakeDate.
 */
export function filterSleepRecordsByWakeDate(
  records: SleepRecord[],
  start?: string,
  end?: string
): SleepRecord[] {
  return records.filter((record) => {
    if (start && record.wakeDate < start) return false;
    if (end && record.wakeDate > end) return false;
    return true;
  });
}

/**
 * STEP 2:
 * Calculate the same multi-night descriptive statistics as the Python pipeline.
 */
export function analyseSleepRecords(
  records: SleepRecord[],
  thresholdHours = 7
): SleepSummary | null {
  if (records.length === 0) {
    return null;
  }

  const onsetStats = calculateTimeStats(records, "sleepOnset");
  const wakeStats = calculateTimeStats(records, "wakeTime");

  const durations = records.map((r) => r.totalSleepMinutes);

  const shortNights = records.filter(
    (r) => r.totalSleepHours < thresholdHours
  );

  const sufficientNights = records.filter(
    (r) => r.totalSleepHours >= thresholdHours
  );

  const shortOnset = meanClock(shortNights, "sleepOnset");
  const sufficientOnset = meanClock(sufficientNights, "sleepOnset");

  const shortWake = meanClock(shortNights, "wakeTime");
  const sufficientWake = meanClock(sufficientNights, "wakeTime");

  const onsetDifference =
    shortOnset !== null && sufficientOnset !== null
      ? round(shortOnset - sufficientOnset, 1)
      : null;

  const wakeDifference =
    shortWake !== null && sufficientWake !== null
      ? round(shortWake - sufficientWake, 1)
      : null;

  return {
    numberOfNights: records.length,

    sleepDuration: {
      averageHours: round(mean(durations) / 60, 2),
      medianHours: round(median(durations) / 60, 2),
      shortestHours: round(Math.min(...durations) / 60, 2),
      longestHours: round(Math.max(...durations) / 60, 2),
      rangeHours: round(
        (Math.max(...durations) - Math.min(...durations)) / 60,
        2
      ),
    },

    bedtime: {
      average: formatClockFromMinutes(onsetStats.meanMinutes),
      median: formatClockFromMinutes(onsetStats.medianMinutes),
      earliest: formatClock(onsetStats.earliest),
      latest: formatClock(onsetStats.latest),
      range: formatDuration(onsetStats.rangeMinutes),
      variabilitySdMinutes: round(
        onsetStats.standardDeviationMinutes,
        1
      ),
    },

    wakeTime: {
      average: formatClockFromMinutes(wakeStats.meanMinutes),
      median: formatClockFromMinutes(wakeStats.medianMinutes),
      earliest: formatClock(wakeStats.earliest),
      latest: formatClock(wakeStats.latest),
      range: formatDuration(wakeStats.rangeMinutes),
      variabilitySdMinutes: round(
        wakeStats.standardDeviationMinutes,
        1
      ),
    },

    insufficientSleep: {
      thresholdHours,
      nightsBelowThreshold: shortNights.length,
      percentageBelowThreshold: round(
        (100 * shortNights.length) / records.length,
        1
      ),

      averageBedtimeShortNights: formatClockFromMinutes(shortOnset),
      averageBedtimeSufficientNights:
        formatClockFromMinutes(sufficientOnset),
      bedtimeDifferenceMinutes: onsetDifference,
      bedtimeDifferenceText: differenceText(
        onsetDifference,
        "later",
        "earlier"
      ),

      averageWakeShortNights: formatClockFromMinutes(shortWake),
      averageWakeSufficientNights:
        formatClockFromMinutes(sufficientWake),
      wakeDifferenceMinutes: wakeDifference,
      wakeDifferenceText: differenceText(
        wakeDifference,
        "later",
        "earlier"
      ),
    },
  };
}

/**
 * Convenience function for the app.
 *
 * Raw HealthKit records
 *       ↓
 * Nightly SleepRecord[]
 *       ↓
 * Summary statistics
 */
export function processSleepData(
  rawRecords: RawSleepRecord[],
  options?: {
    startDate?: string;
    endDate?: string;
    insufficientSleepThresholdHours?: number;
  }
): {
  nightlyRecords: SleepRecord[];
  summary: SleepSummary | null;
} {
  const allNightlyRecords = buildNightlySleepRecords(rawRecords);

  const nightlyRecords = filterSleepRecordsByWakeDate(
    allNightlyRecords,
    options?.startDate,
    options?.endDate
  );

  const summary = analyseSleepRecords(
    nightlyRecords,
    options?.insufficientSleepThresholdHours ?? 7
  );

  return {
    nightlyRecords,
    summary,
  };
}
