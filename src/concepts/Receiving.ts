import { randomUUID } from "node:crypto";
import { MongoServerError, type Collection, type Db, type Document } from "mongodb";

export type ReceivingStatus = "PENDING" | "RELEASED" | "ABSENT";

export interface ReceivingEntry {
  item: string;
  status: "PENDING" | "RELEASED";
}

export interface ReceivingWindowDocument {
  window: string;
  person: string;
  startedAt: Date;
  expiresAt: Date;
}

export interface ReceivingDocument {
  _id: string;
  window: ReceivingWindowDocument | null;
  entries: ReceivingEntry[];
}

export interface WindowRow {
  window: string;
  person: string;
  startedAt: string;
  expiresAt: string;
}

export const RECEIVING_WINDOW_MS = 15 * 60 * 1_000;

/** Own receiving permission and delivery state in one atomic recipient document. */
export class Receiving {
  private readonly recipients: Collection<ReceivingDocument>;
  private indexes?: Promise<string>;

  constructor(db: Db, private readonly clock?: () => number) {
    this.recipients = db.collection<ReceivingDocument>("receiving_recipients");
  }

  async #ensureIndexes(): Promise<void> {
    this.indexes ??= this.recipients.createIndex({ "window.expiresAt": 1 });
    await this.indexes;
  }

  #instant(): string | { $literal: Date } {
    // Production decisions use MongoDB's time within the atomic operation.
    // Tests can supply one deterministic clock without changing the stored shape.
    return this.clock ? { $literal: new Date(this.clock()) } : "$$NOW";
  }

  async #retryUpsert<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
      // Two instances can both see an absent recipient. The winning insert leaves
      // a document for the losing operation to update; actions never delete it.
      return operation();
    }
  }

  async enqueue(input: { recipient: string; item: string }): Promise<{ recipient: string; item: string }> {
    await this.#ensureIndexes();
    const instant = this.#instant();
    const pipeline: Document[] = [{
      $set: {
        window: { $ifNull: ["$window", null] },
        entries: {
          $let: {
            vars: { existing: { $ifNull: ["$entries", []] } },
            in: {
              $cond: [
                { $in: [{ $literal: input.item }, { $map: { input: "$$existing", as: "entry", in: "$$entry.item" } }] },
                "$$existing",
                {
                  $concatArrays: ["$$existing", [{
                    item: { $literal: input.item },
                    status: {
                      $cond: [
                        { $and: [
                          { $ne: [{ $ifNull: ["$window", null] }, null] },
                          { $gt: ["$window.expiresAt", instant] },
                        ] },
                        "RELEASED", "PENDING",
                      ],
                    },
                  }]],
                },
              ],
            },
          },
        },
      },
    }];
    await this.#retryUpsert(() => this.recipients.updateOne({ _id: input.recipient }, pipeline, { upsert: true }));
    return { ...input };
  }

  async open(input: { person: string }): Promise<WindowRow> {
    await this.#ensureIndexes();
    const instant = this.#instant();
    const window = randomUUID();
    const pipeline: Document[] = [{
      $set: {
        window: {
          window: { $literal: window },
          person: { $literal: input.person },
          startedAt: instant,
          expiresAt: { $add: [instant, RECEIVING_WINDOW_MS] },
        },
        entries: {
          $map: {
            input: { $ifNull: ["$entries", []] },
            as: "entry",
            in: { item: "$$entry.item", status: "RELEASED" },
          },
        },
      },
    }];
    const record = await this.#retryUpsert(() => this.recipients.findOneAndUpdate(
      { _id: input.person }, pipeline,
      { upsert: true, returnDocument: "after", projection: { _id: 0, window: 1 } },
    ));
    if (!record?.window) throw new Error("Receiving.open did not return its new window");
    return this.#windowRow(record.window);
  }

  async close(input: { person: string; window: string }): Promise<{ person: string; window: string }> {
    await this.#ensureIndexes();
    await this.recipients.updateOne(
      { _id: input.person, "window.window": input.window },
      { $set: { window: null } },
    );
    return { ...input };
  }

  async expire(input: { window: string }): Promise<{ window: string }> {
    await this.#ensureIndexes();
    await this.recipients.updateOne(
      { "window.window": input.window, $expr: { $lte: ["$window.expiresAt", this.#instant()] } },
      { $set: { window: null } },
    );
    return { ...input };
  }

  async _pending(input: { recipient: string }): Promise<{ item: string }[]> {
    return this.#items(input.recipient, "PENDING");
  }

  async _released(input: { recipient: string }): Promise<{ item: string }[]> {
    return this.#items(input.recipient, "RELEASED");
  }

  async #items(recipient: string, status: ReceivingEntry["status"]): Promise<{ item: string }[]> {
    const record = await this.recipients.findOne({ _id: recipient }, { projection: { _id: 0, entries: 1 } });
    return (record?.entries ?? []).filter(entry => entry.status === status)
      .map(({ item }) => ({ item })).sort((left, right) => left.item.localeCompare(right.item));
  }

  async _hasPending(input: { recipient: string }): Promise<{ waiting: boolean }> {
    const record = await this.recipients.findOne(
      { _id: input.recipient, "entries.status": "PENDING" }, { projection: { _id: 1 } },
    );
    return { waiting: record !== null };
  }

  async _status(input: { recipient: string; item: string }): Promise<{ status: ReceivingStatus }> {
    const record = await this.recipients.findOne(
      { _id: input.recipient }, { projection: { _id: 0, entries: { $elemMatch: { item: input.item } } } },
    );
    return { status: record?.entries?.[0]?.status ?? "ABSENT" };
  }

  async _current(input: { person: string }): Promise<WindowRow[]> {
    const record = await this.recipients.findOne({ _id: input.person }, { projection: { _id: 0, window: 1 } });
    return record?.window ? [this.#windowRow(record.window)] : [];
  }

  async _active(input: { person: string }): Promise<WindowRow[]> {
    const record = await this.recipients.findOne(
      { _id: input.person, $expr: { $gt: ["$window.expiresAt", this.#instant()] } },
      { projection: { _id: 0, window: 1 } },
    );
    return record?.window ? [this.#windowRow(record.window)] : [];
  }

  async _isOpen(input: { person: string }): Promise<{ open: boolean }> {
    return { open: (await this._active(input)).length > 0 };
  }

  async _expired(_input: Record<string, never>): Promise<{ window: string }[]> {
    const records = await this.recipients.find(
      { "window.window": { $exists: true }, $expr: { $lte: ["$window.expiresAt", this.#instant()] } },
      { projection: { _id: 0, window: 1 } },
    ).sort({ "window.expiresAt": 1, "window.window": 1 }).toArray();
    return records.flatMap(record => record.window ? [{ window: record.window.window }] : []);
  }

  #windowRow(window: ReceivingWindowDocument): WindowRow {
    return {
      window: window.window,
      person: window.person,
      startedAt: window.startedAt.toISOString(),
      expiresAt: window.expiresAt.toISOString(),
    };
  }
}
