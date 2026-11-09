
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { SleepRecord } from "./sleepProcessing";

// ============================================
// GENERATE CSV FROM PROCESSED SLEEP RECORDS
// ============================================

export function generateSleepCSV(
  records: SleepRecord[]
): string {
  const headers = [
    "nightDate",
    "sleepOnset",
    "wakeTime",
    "totalSleepMinutes",
    "totalSleepHours",
  ];

  const sortedRecords = [...records].sort((a, b) =>
    a.nightDate.localeCompare(b.nightDate)
  );

  const rows = sortedRecords.map((record) => [
    record.nightDate,
    record.sleepOnset.toISOString(),
    record.wakeTime.toISOString(),
    record.totalSleepMinutes,
    record.totalSleepHours,
  ]);

  return [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");
}

// ============================================
// EXPORT CSV FILE TO IOS FILES
// ============================================

export async function exportSleepCSV(
  records: SleepRecord[]
): Promise<void> {
  if (records.length === 0) {
    console.warn("No sleep records to export.");
    return;
  }

  const csv = generateSleepCSV(records);

  const file = new File(
    Paths.cache,
    "nightly_sleep.csv"
  );

  file.create({ overwrite: true });
  file.write(csv);

  const isAvailable = await Sharing.isAvailableAsync();

  if (!isAvailable) {
    throw new Error(
      "File sharing is not available on this device."
    );
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
    dialogTitle: "Export SleepLoop Data",
  });

  console.log(
    `CSV export opened for ${records.length} sleep nights.`
  );
}
