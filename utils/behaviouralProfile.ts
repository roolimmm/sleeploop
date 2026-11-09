
import type { SleepSummary } from "./sleepProcessing";

import type {
    DetectionStatus,
    InsufficientSleepResult,
    IrregularSleepResult,
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

  // Preliminary behavioural patterns
  patterns: {
    insufficientSleep: {
      status: DetectionStatus;
      percentageInsufficient: number;
      averageInsufficientHours: number | null;
    };

    irregularSleep: {
      status: DetectionStatus;
      irregularSleepOnset: boolean;
      irregularWakeTime: boolean;
      sleepOnsetVariabilityMinutes: number;
      wakeTimeVariabilityMinutes: number;
    };
  };

  // Overall summary
  detectedPatterns: string[];
  detectedPatternCount: number;
}

export function generateBehaviouralProfile(
  summary: SleepSummary | null,
  insufficientSleepPattern: InsufficientSleepResult,
  irregularSleepPattern: IrregularSleepResult
): SleepBehaviouralProfile | null {
  // 1. Validate available sleep data
  if (summary === null || summary.numberOfNights === 0) {
    return null;
  }

  // 2. Identify detected behavioural patterns
  const detectedPatterns: string[] = [];

  if (insufficientSleepPattern.status === "detected") {
    detectedPatterns.push("insufficient_sleep");
  }

  if (irregularSleepPattern.status === "detected") {
    detectedPatterns.push("irregular_sleep");
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
      insufficientSleep: {
        status: insufficientSleepPattern.status,
        percentageInsufficient:
          insufficientSleepPattern.percentageInsufficient,
        averageInsufficientHours:
          insufficientSleepPattern.averageInsufficientHours,
      },

      irregularSleep: {
        status: irregularSleepPattern.status,
        irregularSleepOnset:
          irregularSleepPattern.irregularSleepOnset,
        irregularWakeTime:
          irregularSleepPattern.irregularWakeTime,
        sleepOnsetVariabilityMinutes:
          irregularSleepPattern.sleepOnsetVariabilityMinutes,
        wakeTimeVariabilityMinutes:
          irregularSleepPattern.wakeTimeVariabilityMinutes,
      },
    },

    detectedPatterns,
    detectedPatternCount: detectedPatterns.length,
  };

  return profile;
}
