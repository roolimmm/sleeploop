import fs from "fs";
import { XMLParser } from "fast-xml-parser";

import {
  processSleepData,
  RawSleepRecord,
} from "../utils/sleepProcessing";

const EXPORT_PATH = "./test-data/export.xml";

function parseAppleHealthExport(path: string): RawSleepRecord[] {
  const xml = fs.readFileSync(path, "utf-8");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });

  const parsed = parser.parse(xml);

  const records = parsed.HealthData.Record;

  if (!Array.isArray(records)) {
    throw new Error("No Apple Health records found.");
  }

  const sleepRecords: RawSleepRecord[] = records
    .filter(
      (record: any) =>
        record.type === "HKCategoryTypeIdentifierSleepAnalysis"
    )
    .filter((record: any) =>
      [
        "HKCategoryValueSleepAnalysisAsleepCore",
        "HKCategoryValueSleepAnalysisAsleepDeep",
        "HKCategoryValueSleepAnalysisAsleepREM",
        "HKCategoryValueSleepAnalysisAsleepUnspecified",
      ].includes(record.value)
    )
    .map((record: any) => ({
      startDate: convertAppleDate(record.startDate),
      endDate: convertAppleDate(record.endDate),
      value: record.value,
      sourceName: record.sourceName,
    }));

  return sleepRecords;
}

function convertAppleDate(value: string): string {
  // Apple Health XML often looks like:
  // 2026-09-01 23:15:00 +0800
  //
  // Convert to something JavaScript understands:
  // 2026-09-01T23:15:00+08:00

  return value.replace(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,
    "$1T$2$3:$4"
  );
}

function main() {
  const rawRecords = parseAppleHealthExport(EXPORT_PATH);

  console.log("Raw asleep records:", rawRecords.length);

  const result = processSleepData(rawRecords, {
    startDate: "2026-08-30",
    endDate: "2026-09-14",
    insufficientSleepThresholdHours: 7,
  });

  console.log("\n=== NIGHTLY RECORDS ===");

  for (const night of result.nightlyRecords) {
    console.log({
      nightDate: night.nightDate,
      wakeDate: night.wakeDate,
      sleepOnset: night.sleepOnset.toLocaleString(),
      wakeTime: night.wakeTime.toLocaleString(),
      totalSleepHours: night.totalSleepHours.toFixed(2),
    });
  }

  console.log("\n=== SUMMARY ===");
  console.log(result.summary);
}

main();