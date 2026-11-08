
import type {
    BedtimeDelay,
} from "./patternDetection";
import type { SleepRecord } from "./sleepProcessing";

// ==================================================
// SLEEPLOOP NEXT-NIGHT PREDICTION
// Statistical baseline — Version 1
// ==================================================

export type PredictionRiskLevel =
  | "low"
  | "moderate"
  | "high"
  | "unknown";

export interface SleepPrediction {
  generatedAt: string;
  targetNightDate: string;
  method: "recency_weighted_baseline";

  dataQuality: {
    validNights: number;
    recentNightsUsed: number;
    minimumNightsRequired: number;
    sufficientData: boolean;
  };

  predictedSleep: {
    sleepOnset: string;
    wakeTime: string;
    durationHours: number;
  } | null;

  risks: {
    delayedSleepOnset: {
      level: PredictionRiskLevel;
      estimatedPercentage: number | null;
      plannedBedtime: string | null;
    };

    insufficientSleep: {
      level: PredictionRiskLevel;
      estimatedPercentage: number | null;
    };

    irregularSleep: {
      level: PredictionRiskLevel;
      estimatedPercentage: number | null;
    };
  };
}

// ==================================================
// CONFIGURATION
// ==================================================

const DEFAULT_RECENT_NIGHTS = 7;
const MINIMUM_NIGHTS = 5;

const INSUFFICIENT_SLEEP_HOURS = 7;
const DELAY_THRESHOLD_MINUTES = 30;
const IRREGULAR_THRESHOLD_MINUTES = 60;

// ==================================================
// HELPERS
// ==================================================

function round(
  value: number,
  decimals = 1
): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function weightedMean(
  values: number[]
): number {
  if (values.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  values.forEach((value, index) => {
    const weight = index + 1;

    weightedSum += value * weight;
    totalWeight += weight;
  });

  return weightedSum / totalWeight;
}

function weightedPercentage(
  flags: boolean[]
): number {
  if (flags.length === 0) return 0;

  let flaggedWeight = 0;
  let totalWeight = 0;

  flags.forEach((flag, index) => {
    const weight = index + 1;

    totalWeight += weight;

    if (flag) {
      flaggedWeight += weight;
    }
  });

  return round(
    (flaggedWeight / totalWeight) * 100,
    1
  );
}

function weightedStandardDeviation(
  values: number[]
): number {
  if (values.length <= 1) return 0;

  const average = weightedMean(values);

  let weightedSquaredDifference = 0;
  let totalWeight = 0;

  values.forEach((value, index) => {
    const weight = index + 1;

    weightedSquaredDifference +=
      weight * (value - average) ** 2;

    totalWeight += weight;
  });

  return Math.sqrt(
    weightedSquaredDifference / totalWeight
  );
}

// --------------------------------------------------
// Convert Date into overnight clock minutes
//
// 11:30 PM -> 1410
// 12:30 AM -> 1470
// --------------------------------------------------

function overnightMinutes(
  date: Date
): number {
  const hours = date.getHours();
  const minutes =
    hours * 60 +
    date.getMinutes() +
    date.getSeconds() / 60;

  return hours < 12
    ? minutes + 1440
    : minutes;
}

// --------------------------------------------------
// Convert minutes into readable clock time
// --------------------------------------------------

function formatClock(
  minutes: number
): string {
  const normalized =
    ((Math.round(minutes) % 1440) + 1440) %
    1440;

  const hours24 = Math.floor(
    normalized / 60
  );

  const mins = normalized % 60;

  const hours12 = hours24 % 12 || 12;
  const suffix =
    hours24 < 12 ? "AM" : "PM";

  return (
    `${hours12}:` +
    `${String(mins).padStart(2, "0")} ` +
    suffix
  );
}

// --------------------------------------------------
// Convert percentage into a risk category
// --------------------------------------------------

function classifyRisk(
  percentage: number | null
): PredictionRiskLevel {
  if (percentage === null) return "unknown";

  if (percentage >= 60) return "high";
  if (percentage >= 30) return "moderate";

  return "low";
}

// --------------------------------------------------
// Determine next night date
// --------------------------------------------------

function nextNightDate(
  nightDate: string
): string {
  const date = new Date(
    `${nightDate}T12:00:00Z`
  );

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return date.toISOString().slice(0, 10);
}

// --------------------------------------------------
// Convert planned bedtime HH:mm into
// overnight minutes
// --------------------------------------------------

function plannedBedtimeMinutes(
  plannedBedtime: string
): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(
    plannedBedtime
  );

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const total = hours * 60 + minutes;

  return hours < 12
    ? total + 1440
    : total;
}

// ==================================================
// MAIN PREDICTION FUNCTION
// ==================================================

export function predictNextNightSleep(
  sleepRecords: SleepRecord[],
  bedtimeDelays: BedtimeDelay[] = [],
  nextPlannedBedtime: string | null = null,
  recentNightLimit = DEFAULT_RECENT_NIGHTS
): SleepPrediction {
  // --------------------------------------------------
  // 1. Validate and sort sleep records
  // --------------------------------------------------

  const validRecords = sleepRecords
    .filter((record) => {
      return (
        record.sleepOnset instanceof Date &&
        record.wakeTime instanceof Date &&
        !Number.isNaN(
          record.sleepOnset.getTime()
        ) &&
        !Number.isNaN(
          record.wakeTime.getTime()
        ) &&
        Number.isFinite(
          record.totalSleepHours
        ) &&
        record.totalSleepHours > 0 &&
        record.totalSleepHours <= 24
      );
    })
    .sort((a, b) =>
      a.nightDate.localeCompare(
        b.nightDate
      )
    );

  const uniqueRecords = [
    ...new Map(
      validRecords.map((record) => [
        record.nightDate,
        record,
      ])
    ).values(),
  ];

  const recentRecords =
    uniqueRecords.slice(
      -Math.max(
        1,
        Math.floor(recentNightLimit)
      )
    );

  const validNights =
    uniqueRecords.length;

  const sufficientData =
    recentRecords.length >=
    MINIMUM_NIGHTS;

  const targetNightDate =
    uniqueRecords.length > 0
      ? nextNightDate(
          uniqueRecords[
            uniqueRecords.length - 1
          ].nightDate
        )
      : "";

  // --------------------------------------------------
  // 2. Handle insufficient data
  // --------------------------------------------------

  if (!sufficientData) {
    return {
      generatedAt: new Date().toISOString(),
      targetNightDate,
      method: "recency_weighted_baseline",

      dataQuality: {
        validNights,
        recentNightsUsed:
          recentRecords.length,
        minimumNightsRequired:
          MINIMUM_NIGHTS,
        sufficientData: false,
      },

      predictedSleep: null,

      risks: {
        delayedSleepOnset: {
          level: "unknown",
          estimatedPercentage: null,
          plannedBedtime:
            nextPlannedBedtime,
        },

        insufficientSleep: {
          level: "unknown",
          estimatedPercentage: null,
        },

        irregularSleep: {
          level: "unknown",
          estimatedPercentage: null,
        },
      },
    };
  }

  // --------------------------------------------------
  // 3. Predict sleep onset and duration
  // --------------------------------------------------

  const onsetMinutes =
    recentRecords.map(
      (record) =>
        overnightMinutes(
          record.sleepOnset
        )
    );

  const durations =
    recentRecords.map(
      (record) =>
        record.totalSleepHours
    );

  const predictedOnsetMinutes =
    weightedMean(onsetMinutes);

  const predictedDurationHours =
    weightedMean(durations);

  // --------------------------------------------------
  // 4. Predict wake time
  // --------------------------------------------------

  const wakeMinutes =
    recentRecords.map(
      (record) =>
        overnightMinutes(
          record.wakeTime
        )
    );

  const predictedWakeMinutes =
    weightedMean(wakeMinutes);

  // --------------------------------------------------
  // 5. Estimate insufficient-sleep risk
  // --------------------------------------------------

  const insufficientFlags =
    recentRecords.map(
      (record) =>
        record.totalSleepHours <
        INSUFFICIENT_SLEEP_HOURS
    );

  const insufficientPercentage =
    weightedPercentage(
      insufficientFlags
    );

  // --------------------------------------------------
  // 6. Estimate irregular-sleep risk
  // --------------------------------------------------

  const onsetVariability =
    weightedStandardDeviation(
      onsetMinutes
    );

  const wakeVariability =
    weightedStandardDeviation(
      wakeMinutes
    );

  // Irregularity is defined as deviation from
  // the weighted typical schedule.
  const irregularFlags =
    recentRecords.map(
      (record) => {
        const onsetDeviation =
          Math.abs(
            overnightMinutes(
              record.sleepOnset
            ) -
            predictedOnsetMinutes
          );

        const wakeDeviation =
          Math.abs(
            overnightMinutes(
              record.wakeTime
            ) -
            predictedWakeMinutes
          );

        return (
          onsetDeviation >=
            IRREGULAR_THRESHOLD_MINUTES ||
          wakeDeviation >=
            IRREGULAR_THRESHOLD_MINUTES
        );
      }
    );

  const irregularPercentage =
    weightedPercentage(
      irregularFlags
    );

  // --------------------------------------------------
  // 7. Estimate delayed-sleep-onset risk
  // --------------------------------------------------

  let delayedPercentage:
    number | null = null;

  const plannedMinutes =
    nextPlannedBedtime
      ? plannedBedtimeMinutes(
          nextPlannedBedtime
        )
      : null;

  if (plannedMinutes !== null) {
    // Predict whether the expected onset is
    // at least 30 minutes after planned bedtime.
    const predictedDelay =
      predictedOnsetMinutes -
      plannedMinutes;

    // Use historical delays when available.
    const recentDelayRecords =
      bedtimeDelays
        .filter((record) =>
          Number.isFinite(
            record.delayMinutes
          )
        )
        .sort((a, b) =>
          a.nightDate.localeCompare(
            b.nightDate
          )
        )
        .slice(-recentNightLimit);

    if (recentDelayRecords.length >= 3) {
      delayedPercentage =
        weightedPercentage(
          recentDelayRecords.map(
            (record) =>
              record.delayMinutes >=
              DELAY_THRESHOLD_MINUTES
          )
        );
    } else {
      delayedPercentage =
        predictedDelay >=
        DELAY_THRESHOLD_MINUTES
          ? 100
          : 0;
    }
  }

  // --------------------------------------------------
  // 8. Return prediction
  // --------------------------------------------------

  return {
    generatedAt: new Date().toISOString(),
    targetNightDate,
    method: "recency_weighted_baseline",

    dataQuality: {
      validNights,
      recentNightsUsed:
        recentRecords.length,
      minimumNightsRequired:
        MINIMUM_NIGHTS,
      sufficientData: true,
    },

    predictedSleep: {
      sleepOnset: formatClock(
        predictedOnsetMinutes
      ),

      wakeTime: formatClock(
        predictedWakeMinutes
      ),

      durationHours: round(
        predictedDurationHours,
        2
      ),
    },

    risks: {
      delayedSleepOnset: {
        level: classifyRisk(
          delayedPercentage
        ),

        estimatedPercentage:
          delayedPercentage,

        plannedBedtime:
          nextPlannedBedtime,
      },

      insufficientSleep: {
        level: classifyRisk(
          insufficientPercentage
        ),

        estimatedPercentage:
          insufficientPercentage,
      },

      irregularSleep: {
        level: classifyRisk(
          irregularPercentage
        ),

        estimatedPercentage:
          irregularPercentage,
      },
    },
  };
}
