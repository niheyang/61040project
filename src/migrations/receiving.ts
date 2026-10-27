import { MongoServerError, type Db } from "mongodb";
import type { ReceivingDocument, ReceivingEntry, ReceivingWindowDocument } from "../concepts/Receiving.ts";

const migration = "receiving-v1";

interface MigrationResult {
  alreadyApplied: boolean;
  recipients: number;
  entries: number;
  windows: number;
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function legacyDate(value: unknown): Date {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) {
    throw new Error("Receiving migration stopped: a legacy window has an invalid date. Original collections were retained.");
  }
  return date;
}

/** One-time upgrade of retired storage, run before admitting application traffic. */
export async function migrateReceiving(database: Db): Promise<MigrationResult> {
  const migrations = database.collection<{ _id: string; completedAt: Date }>("schema_migrations");
  if (await migrations.findOne({ _id: migration })) {
    return { alreadyApplied: true, recipients: 0, entries: 0, windows: 0 };
  }
  const [entries, windows] = await Promise.all([
    database.collection("holding_entries").find({}).toArray(),
    database.collection("receptivity_windows").find({}).toArray(),
  ]);
  const recipients = new Map<string, ReceivingDocument>();
  function recipient(person: string) {
    let record = recipients.get(person);
    if (!record) {
      record = { _id: person, window: null, entries: [] };
      recipients.set(person, record);
    }
    return record;
  }

  // Validate the complete legacy snapshot before writing the replacement schema.
  for (const entry of entries) {
    if (!text(entry.recipient) || !text(entry.item) || !["PENDING", "RELEASED"].includes(entry.status)) {
      throw new Error("Receiving migration stopped: a legacy holding entry is invalid. Original collections were retained.");
    }
    const record = recipient(entry.recipient);
    const existing = record.entries.find(item => item.item === entry.item);
    if (existing) {
      // Availability is permanent, including in an old duplicate pair.
      if (entry.status === "RELEASED") existing.status = "RELEASED";
    } else {
      record.entries.push({ item: entry.item, status: entry.status } as ReceivingEntry);
    }
  }
  for (const window of windows) {
    if (!text(window.person) || !text(window.window)) {
      throw new Error("Receiving migration stopped: a legacy window is invalid. Original collections were retained.");
    }
    const record = recipient(window.person);
    if (record.window) {
      throw new Error("Receiving migration stopped: a person has multiple legacy windows. Original collections were retained.");
    }
    const migrated: ReceivingWindowDocument = {
      window: window.window, person: window.person,
      startedAt: legacyDate(window.startedAt), expiresAt: legacyDate(window.expiresAt),
    };
    if (migrated.expiresAt <= migrated.startedAt) {
      throw new Error("Receiving migration stopped: a legacy window has an invalid duration. Original collections were retained.");
    }
    record.window = migrated;
  }

  const target = database.collection<ReceivingDocument>("receiving_recipients");
  for (const record of recipients.values()) {
    record.entries.sort((a, b) => a.item.localeCompare(b.item));
    try {
      // Never replace a recipient already upgraded by another start or retry.
      await target.updateOne({ _id: record._id }, { $setOnInsert: record }, { upsert: true });
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      if (!(await target.findOne({ _id: record._id }))) throw error;
    }
  }
  const result = {
    alreadyApplied: false, recipients: recipients.size,
    entries: [...recipients.values()].reduce((sum, record) => sum + record.entries.length, 0),
    windows: windows.length,
  };
  try {
    await migrations.updateOne({ _id: migration }, {
      $setOnInsert: { _id: migration, completedAt: new Date() },
    }, { upsert: true });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    if (!(await migrations.findOne({ _id: migration }))) throw error;
  }
  return result;
}
