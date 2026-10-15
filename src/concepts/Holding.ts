import { MongoServerError, type Collection, type Db } from "mongodb";

export type HoldingStatus = "PENDING" | "RELEASED" | "ABSENT";

interface Entry {
  recipient: string;
  item: string;
  status: "PENDING" | "RELEASED";
}

export class Holding {
  private readonly entries: Collection<Entry>;
  private indexes?: Promise<unknown>;

  constructor(db: Db) {
    this.entries = db.collection<Entry>("holding_entries");
  }

  async #ensureIndexes(): Promise<void> {
    this.indexes ??= this.entries.createIndexes([
      { key: { recipient: 1, item: 1 }, unique: true },
      { key: { recipient: 1, status: 1 } },
    ]);
    await this.indexes;
  }

  async enqueue(input: { recipient: string; item: string }): Promise<{ recipient: string; item: string }> {
    await this.#ensureIndexes();
    try {
      await this.entries.updateOne(input, { $setOnInsert: { ...input, status: "PENDING" } }, { upsert: true });
    } catch (error) {
      // A simultaneous enqueue may have created the same pair first.
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    }
    return { ...input };
  }

  async release(input: { recipient: string; items: string[] }): Promise<{ released: string[] }> {
    await this.#ensureIndexes();
    const released: string[] = [];
    for (const item of new Set(input.items)) {
      const record = await this.entries.findOneAndUpdate(
        { recipient: input.recipient, item, status: "PENDING" },
        { $set: { status: "RELEASED" } },
        { returnDocument: "before" },
      );
      if (record) released.push(item);
    }
    return { released };
  }

  async _pending(input: { recipient: string }): Promise<{ item: string }[]> {
    return this.entries.find({ ...input, status: "PENDING" }, { projection: { _id: 0, item: 1 } })
      .sort({ item: 1 }).toArray();
  }

  async _released(input: { recipient: string }): Promise<{ item: string }[]> {
    return this.entries.find({ ...input, status: "RELEASED" }, { projection: { _id: 0, item: 1 } })
      .sort({ item: 1 }).toArray();
  }

  async _status(input: { recipient: string; item: string }): Promise<{ status: HoldingStatus }> {
    const record = await this.entries.findOne(input);
    return { status: record?.status ?? "ABSENT" };
  }
}
