import type { SleepRecord } from "./sleepProcessing";

export type DetectionStatus =
  | "detected"
  | "not_detected"
  | "insufficient_data";

export interface InsufficientSleepResult {
  status: DetectionStatus;
  detected: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  totalNights: number;
  validNights: number;
  missingNights: number;
  insufficientNights: number;
  percentageInsufficient: number;
  averageSleepHours: number;
  averageInsufficientHours: number | null;
  thresholdHours: number;
  requiredPercentage: number;
}

export interface IrregularSleepResult {
  status: DetectionStatus;
  detected: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  totalNights: number;
  validNights: number;
  missingNights: number;
  sleepOnsetVariabilityMinutes: number;
  wakeTimeVariabilityMinutes: number;
  irregularSleepOnset: boolean;
  irregularWakeTime: boolean;
  thresholdMinutes: number;
  minimumValidNights: number;
}

function isValidNightDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function calculateObservationPeriod(nightDates: string[]): {
  periodStart: string | null;
  periodEnd: string | null;
  totalNights: number;
  missingNights: number;
} {
  const uniqueDates = [...new Set(nightDates.filter(isValidNightDate))].sort();
  if (uniqueDates.length === 0) {
    return { periodStart: null, periodEnd: null, totalNights: 0, missingNights: 0 };
  }
  const periodStart = uniqueDates[0];
  const periodEnd = uniqueDates[uniqueDates.length - 1];
  const totalNights =
    Math.round(
      (Date.parse(`${periodEnd}T00:00:00Z`) -
        Date.parse(`${periodStart}T00:00:00Z`)) /
        86400000
    ) + 1;
  return {
    periodStart,
    periodEnd,
    totalNights,
    missingNights: totalNights - uniqueDates.length,
  };
}

function validRecords(sleepRecords: SleepRecord[]): SleepRecord[] {
  const byDate = new Map<string, SleepRecord>();
  for (const record of sleepRecords) {
    if (
      isValidNightDate(record.nightDate) &&
      Number.isFinite(record.totalSleepHours) &&
      record.totalSleepHours > 0 &&
      record.totalSleepHours <= 24
    ) {
      byDate.set(record.nightDate, record);
    }
  }
  return [...byDate.values()].sort((a, b) =>
    a.nightDate.localeCompare(b.nightDate)
  );
}

// ==================================================
// PATTERN 1: RECURRING INSUFFICIENT SLEEP
// ==================================================
export function detectRecurringInsufficientSleep(
  sleepRecords: SleepRecord[],
  thresholdHours = 7,
  requiredPercentage = 30,
  minimumValidNights = 5
): InsufficientSleepResult {
  const records = validRecords(sleepRecords);
  const validNights = records.length;
  const period = calculateObservationPeriod(records.map((r) => r.nightDate));
  const insufficientRecords = records.filter(
    (r) => r.totalSleepHours < thresholdHours
  );
  const insufficientNights = insufficientRecords.length;
  const percentageInsufficient = validNights
    ? Number(((insufficientNights / validNights) * 100).toFixed(1))
    : 0;
  const averageSleepHours = validNights
    ? Number(
        (records.reduce((sum, r) => sum + r.totalSleepHours, 0) / validNights).toFixed(2)
      )
    : 0;
  const averageInsufficientHours = insufficientNights
    ? Number(
        (
          insufficientRecords.reduce((sum, r) => sum + r.totalSleepHours, 0) /
          insufficientNights
        ).toFixed(2)
      )
    : null;

  const status: DetectionStatus =
    validNights < minimumValidNights
      ? "insufficient_data"
      : percentageInsufficient >= requiredPercentage
        ? "detected"
        : "not_detected";

  return {
    status,
    detected: status === "detected",
    ...period,
    validNights,
    insufficientNights,
    percentageInsufficient,
    averageSleepHours,
    averageInsufficientHours,
    thresholdHours,
    requiredPercentage,
  };
}

// ==================================================
// PATTERN 2: IRREGULAR SLEEP TIMING
// ==================================================
// Compute circular standard deviation of clock times. This avoids treating
// 11:55 PM and 12:05 AM as almost 24 hours apart.
function circularClockSdMinutes(dates: Date[]): number {
  if (dates.length < 2) return 0;
  const angles = dates.map((date) => {
    const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    return (minutes / 1440) * 2 * Math.PI;
  });
  const meanCos = angles.reduce((sum, a) => sum + Math.cos(a), 0) / angles.length;
  const meanSin = angles.reduce((sum, a) => sum + Math.sin(a), 0) / angles.length;
  const r = Math.hypot(meanCos, meanSin);
  if (r < 1e-12) return 720; // Highly dispersed times; cap for reporting.
  return Math.sqrt(-2 * Math.log(Math.min(1, r))) * (1440 / (2 * Math.PI));
}

export function detectIrregularSleep(
  sleepRecords: SleepRecord[],
  thresholdMinutes = 60,
  minimumValidNights = 5
): IrregularSleepResult {
  const records = validRecords(sleepRecords).filter(
    (r) =>
      r.sleepOnset instanceof Date &&
      !Number.isNaN(r.sleepOnset.getTime()) &&
      r.wakeTime instanceof Date &&
      !Number.isNaN(r.wakeTime.getTime())
  );
  const validNights = records.length;
  const period = calculateObservationPeriod(records.map((r) => r.nightDate));
  const sleepOnsetVariabilityMinutes = Number(
    circularClockSdMinutes(records.map((r) => r.sleepOnset)).toFixed(1)
  );
  const wakeTimeVariabilityMinutes = Number(
    circularClockSdMinutes(records.map((r) => r.wakeTime)).toFixed(1)
  );
  const hasEnoughData = validNights >= minimumValidNights;
  const irregularSleepOnset =
    hasEnoughData && sleepOnsetVariabilityMinutes >= thresholdMinutes;
  const irregularWakeTime =
    hasEnoughData && wakeTimeVariabilityMinutes >= thresholdMinutes;
  const status: DetectionStatus = !hasEnoughData
    ? "insufficient_data"
    : irregularSleepOnset || irregularWakeTime
      ? "detected"
      : "not_detected";

  return {
    status,
    detected: status === "detected",
    ...period,
    validNights,
    sleepOnsetVariabilityMinutes,
    wakeTimeVariabilityMinutes,
    irregularSleepOnset,
    irregularWakeTime,
    thresholdMinutes,
    minimumValidNights,
  };
}
