
import type { SleepSummary } from "./sleepProcessing";

import type {
    BedtimePatternResult,
    DetectionStatus,
    InsufficientSleepResult,
} from "./patternDetection";

export interface SleepBehaviouralProfile {
  generatedAt: string;

  // Historical sleep statistics
  sleepHistory: {
    numberOfNights: number;
    averageSleepHours: number;
    medianSleepHours: number;
    shortestSleepHours: number;
    longestSleepHours: number;
  };

  // Typical sleep schedule and variability
  sleepSchedule: {
    typicalSleepOnset: string;
    typicalWakeTime: string;
    sleepOnsetVariabilityMinutes: number;
    wakeTimeVariabilityMinutes: number;
  };

  // Detected behavioural patterns
  patterns: {
    delayedSleepOnset: {
      status: DetectionStatus;
      percentageDelayed: number;
      averageDelayMinutes: number;
    };

    insufficientSleep: {
      status: DetectionStatus;
      percentageInsufficient: number;
      averageInsufficientHours: number | null;
    };
  };

  // Overall summary
  detectedPatterns: string[];
  detectedPatternCount: number;
}

export function generateBehaviouralProfile(
  summary: SleepSummary | null,
  bedtimePattern: BedtimePatternResult,
  insufficientSleepPattern: InsufficientSleepResult
): SleepBehaviouralProfile | null {
  // 1. Validate available sleep data
  if (summary === null || summary.numberOfNights === 0) {
    return null;
  }

  // 2. Identify detected behavioural patterns
  const detectedPatterns: string[] = [];

  if (bedtimePattern.status === "detected") {
    detectedPatterns.push("delayed_sleep_onset");
  }

  if (insufficientSleepPattern.status === "detected") {
    detectedPatterns.push("insufficient_sleep");
  }

  // 3. Combine sleep statistics and pattern results
  const profile: SleepBehaviouralProfile = {
    generatedAt: new Date().toISOString(),

    sleepHistory: {
      numberOfNights: summary.numberOfNights,
      averageSleepHours: summary.sleepDuration.averageHours,
      medianSleepHours: summary.sleepDuration.medianHours,
      shortestSleepHours: summary.sleepDuration.shortestHours,
      longestSleepHours: summary.sleepDuration.longestHours,
    },

    sleepSchedule: {
      typicalSleepOnset: summary.bedtime.median,
      typicalWakeTime: summary.wakeTime.median,
      sleepOnsetVariabilityMinutes:
        summary.bedtime.variabilitySdMinutes,
      wakeTimeVariabilityMinutes:
        summary.wakeTime.variabilitySdMinutes,
    },

    patterns: {
      delayedSleepOnset: {
        status: bedtimePattern.status,
        percentageDelayed:
          bedtimePattern.percentageDelayed,
        averageDelayMinutes:
          bedtimePattern.averageDelayMinutes,
      },

      insufficientSleep: {
        status: insufficientSleepPattern.status,
        percentageInsufficient:
          insufficientSleepPattern.percentageInsufficient,
        averageInsufficientHours:
          insufficientSleepPattern.averageInsufficientHours,
      },
    },

    detectedPatterns,
    detectedPatternCount: detectedPatterns.length,
  };

  return profile;
}
