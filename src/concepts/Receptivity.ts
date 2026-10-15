import { randomUUID } from "node:crypto";
import { MongoServerError, type Collection, type Db } from "mongodb";

export interface WindowRow {
  window: string;
  person: string;
  startedAt: string;
  expiresAt: string;
}

interface WindowDocument extends WindowRow {
  _id: string;
}

export const RECEIVING_WINDOW_MS = 15 * 60 * 1_000;

export class Receptivity {
  private readonly windows: Collection<WindowDocument>;
  private indexes?: Promise<unknown>;

  constructor(db: Db, private readonly now: () => number = Date.now) {
    this.windows = db.collection<WindowDocument>("receptivity_windows");
  }

  async #ensureIndexes(): Promise<void> {
    this.indexes ??= this.windows.createIndexes([
      { key: { window: 1 }, unique: true },
      { key: { expiresAt: 1 } },
    ]);
    await this.indexes;
  }

  async open(input: { person: string }): Promise<WindowRow> {
    await this.#ensureIndexes();
    const now = this.now();
    const record: WindowRow = {
      window: randomUUID(),
      person: input.person,
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + RECEIVING_WINDOW_MS).toISOString(),
    };
    // One document per person makes replacement atomic. Its window handle changes.
    try {
      await this.windows.updateOne({ _id: input.person }, { $set: record }, { upsert: true });
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      await this.windows.updateOne({ _id: input.person }, { $set: record }, { upsert: true });
    }
    return record;
  }

  async close(input: { person: string; window: string }): Promise<{ person: string; window: string }> {
    await this.#ensureIndexes();
    await this.windows.deleteOne({ _id: input.person, window: input.window });
    return { ...input };
  }

  async expire(input: { window: string }): Promise<{ window: string }> {
    await this.#ensureIndexes();
    await this.windows.deleteOne({ window: input.window, expiresAt: { $lte: new Date(this.now()).toISOString() } });
    return { ...input };
  }

  async _current(input: { person: string }): Promise<WindowRow[]> {
    const record = await this.windows.findOne({ _id: input.person }, { projection: { _id: 0 } });
    return record ? [record] : [];
  }

  async _isOpen(input: { person: string }): Promise<{ open: boolean }> {
    const record = await this.windows.findOne({ _id: input.person });
    return { open: Boolean(record && this.now() < Date.parse(record.expiresAt)) };
  }

  async _active(input: { person: string }): Promise<WindowRow[]> {
    return this.windows.find(
      { _id: input.person, expiresAt: { $gt: new Date(this.now()).toISOString() } },
      { projection: { _id: 0 } },
    ).toArray();
  }

  async _expired(_input: Record<string, never>): Promise<{ window: string }[]> {
    return this.windows.find(
      { expiresAt: { $lte: new Date(this.now()).toISOString() } },
      { projection: { _id: 0, window: 1 } },
    ).sort({ expiresAt: 1, window: 1 }).toArray();
  }
}
