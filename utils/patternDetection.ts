
import type { SleepRecord } from "./sleepProcessing";

export interface BedtimePlan {
  nightDate: string;
  plannedBedtime: string; // HH:mm
}

export interface NightlySleepRecord {
  nightDate: string;
  sleepOnset: Date;
}

export interface BedtimeDelay {
  nightDate: string;
  plannedBedtime: string;
  actualSleepOnset: Date;
  delayMinutes: number;
}

export type DetectionStatus =
  | "detected"
  | "not_detected"
  | "insufficient_data";

export interface BedtimePatternResult {
  status: DetectionStatus;
  detected: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  totalNights: number;
  validNights: number;
  missingNights: number;
  delayedNights: number;
  percentageDelayed: number;
  averageDelayMinutes: number;
  thresholdMinutes: number;
  requiredPercentage: number;
}

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

function calculateObservationPeriod(
  nightDates: string[]
): {
  periodStart: string | null;
  periodEnd: string | null;
  totalNights: number;
  missingNights: number;
} {
  const uniqueDates = [...new Set(nightDates)].sort();

  if (uniqueDates.length === 0) {
    return {
      periodStart: null,
      periodEnd: null,
      totalNights: 0,
      missingNights: 0,
    };
  }

  const periodStart = uniqueDates[0];
  const periodEnd = uniqueDates[uniqueDates.length - 1];

  const startDate = new Date(`${periodStart}T00:00:00Z`);
  const endDate = new Date(`${periodEnd}T00:00:00Z`);

  const totalNights =
    Math.round(
      (endDate.getTime() - startDate.getTime()) /
        86400000
    ) + 1;

  return {
    periodStart,
    periodEnd,
    totalNights,
    missingNights: totalNights - uniqueDates.length,
  };
}

// ==================================================
// PATTERN 1: RECURRING DELAYED SLEEP ONSET
// ==================================================

// 1. Calculate planned-to-actual bedtime delay
export function calculateBedtimeDelay(
  nightDate: string,
  plannedBedtime: string,
  actualSleepOnset: Date
): number {
  const [hours, minutes] = plannedBedtime
    .split(":")
    .map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return NaN;
  }

  const plannedDate = new Date(
    `${nightDate}T12:00:00`
  );

  if (Number.isNaN(plannedDate.getTime())) {
    return NaN;
  }

  plannedDate.setHours(hours, minutes, 0, 0);

  // Midnight and morning times belong to
  // the following calendar day.
  if (hours < 12) {
    plannedDate.setDate(
      plannedDate.getDate() + 1
    );
  }

  return Math.round(
    (
      actualSleepOnset.getTime() -
      plannedDate.getTime()
    ) / 60000
  );
}

// 2. Match bedtime plans with sleep records
export function analyseBedtimeDelays(
  bedtimePlans: BedtimePlan[],
  sleepRecords: NightlySleepRecord[]
): BedtimeDelay[] {
  const plansByDate = new Map(
    bedtimePlans.map((plan) => [
      plan.nightDate,
      plan.plannedBedtime,
    ])
  );

  return sleepRecords
    .filter((record) =>
      plansByDate.has(record.nightDate)
    )
    .map((record) => {
      const plannedBedtime = plansByDate.get(
        record.nightDate
      )!;

      return {
        nightDate: record.nightDate,
        plannedBedtime,
        actualSleepOnset: record.sleepOnset,
        delayMinutes: calculateBedtimeDelay(
          record.nightDate,
          plannedBedtime,
          record.sleepOnset
        ),
      };
    })
    .filter((record) =>
      Number.isFinite(record.delayMinutes)
    )
    .sort((a, b) =>
      a.nightDate.localeCompare(b.nightDate)
    );
}

// 3. Detect recurring delayed sleep onset
export function detectRecurringBedtimeDelay(
  bedtimeDelays: BedtimeDelay[],
  thresholdMinutes = 30,
  requiredPercentage = 30,
  minimumValidNights = 5
): BedtimePatternResult {
  const recordsByDate = new Map<
    string,
    BedtimeDelay
  >();

  bedtimeDelays.forEach((record) => {
    if (Number.isFinite(record.delayMinutes)) {
      recordsByDate.set(
        record.nightDate,
        record
      );
    }
  });

  const records = [
    ...recordsByDate.values(),
  ].sort((a, b) =>
    a.nightDate.localeCompare(b.nightDate)
  );

  const validNights = records.length;

  const period = calculateObservationPeriod(
    records.map((record) => record.nightDate)
  );

  if (validNights === 0) {
    return {
      status: "insufficient_data",
      detected: false,
      periodStart: null,
      periodEnd: null,
      totalNights: 0,
      validNights: 0,
      missingNights: 0,
      delayedNights: 0,
      percentageDelayed: 0,
      averageDelayMinutes: 0,
      thresholdMinutes,
      requiredPercentage,
    };
  }

  const delayedRecords = records.filter(
    (record) =>
      record.delayMinutes >= thresholdMinutes
  );

  const delayedNights = delayedRecords.length;

  const percentageDelayed = Number(
    (
      (delayedNights / validNights) *
      100
    ).toFixed(1)
  );

  const averageDelayMinutes =
    delayedNights > 0
      ? Math.round(
          delayedRecords.reduce(
            (sum, record) =>
              sum + record.delayMinutes,
            0
          ) / delayedNights
        )
      : 0;

  let status: DetectionStatus =
    "not_detected";

  if (validNights < minimumValidNights) {
    status = "insufficient_data";
  } else if (
    (delayedNights / validNights) * 100 >=
    requiredPercentage
  ) {
    status = "detected";
  }

  return {
    status,
    detected: status === "detected",
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    totalNights: period.totalNights,
    validNights,
    missingNights: period.missingNights,
    delayedNights,
    percentageDelayed,
    averageDelayMinutes,
    thresholdMinutes,
    requiredPercentage,
  };
}

// ==================================================
// PATTERN 2: RECURRING INSUFFICIENT SLEEP
// ==================================================

export function detectRecurringInsufficientSleep(
  sleepRecords: SleepRecord[],
  thresholdHours = 7,
  requiredPercentage = 30,
  minimumValidNights = 5
): InsufficientSleepResult {
  // 1. Validate and deduplicate records
  const recordsByDate = new Map<
    string,
    SleepRecord
  >();

  sleepRecords.forEach((record) => {
    if (
      Number.isFinite(record.totalSleepHours) &&
      record.totalSleepHours > 0 &&
      record.totalSleepHours <= 24 &&
      !Number.isNaN(
        new Date(
          `${record.nightDate}T00:00:00Z`
        ).getTime()
      )
    ) {
      recordsByDate.set(
        record.nightDate,
        record
      );
    }
  });

  const records = [
    ...recordsByDate.values(),
  ].sort((a, b) =>
    a.nightDate.localeCompare(b.nightDate)
  );

  const validNights = records.length;

  // 2. Calculate observation period
  const period = calculateObservationPeriod(
    records.map((record) => record.nightDate)
  );

  // 3. Handle missing data
  if (validNights === 0) {
    return {
      status: "insufficient_data",
      detected: false,
      periodStart: null,
      periodEnd: null,
      totalNights: 0,
      validNights: 0,
      missingNights: 0,
      insufficientNights: 0,
      percentageInsufficient: 0,
      averageSleepHours: 0,
      averageInsufficientHours: null,
      thresholdHours,
      requiredPercentage,
    };
  }

  // 4. Identify insufficient sleep nights
  const insufficientRecords =
    records.filter(
      (record) =>
        record.totalSleepHours <
        thresholdHours
    );

  const insufficientNights =
    insufficientRecords.length;

  const percentageInsufficient = Number(
    (
      (insufficientNights / validNights) *
      100
    ).toFixed(1)
  );

  // 5. Calculate average sleep duration
  const averageSleepHours = Number(
    (
      records.reduce(
        (sum, record) =>
          sum + record.totalSleepHours,
        0
      ) / validNights
    ).toFixed(2)
  );

  const averageInsufficientHours =
    insufficientNights > 0
      ? Number(
          (
            insufficientRecords.reduce(
              (sum, record) =>
                sum + record.totalSleepHours,
              0
            ) / insufficientNights
          ).toFixed(2)
        )
      : null;

  // 6. Determine pattern status
  let status: DetectionStatus =
    "not_detected";

  if (validNights < minimumValidNights) {
    status = "insufficient_data";
  } else if (
    (insufficientNights / validNights) *
      100 >=
    requiredPercentage
  ) {
    status = "detected";
  }

  return {
    status,
    detected: status === "detected",
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    totalNights: period.totalNights,
    validNights,
    missingNights: period.missingNights,
    insufficientNights,
    percentageInsufficient,
    averageSleepHours,
    averageInsufficientHours,
    thresholdHours,
    requiredPercentage,
  };
}

