import { MongoServerError, type Collection, type Db } from "mongodb";

interface SavedPair {
  person: string;
  item: string;
}

export class Bookmarking {
  private readonly pairs: Collection<SavedPair>;
  private indexes?: Promise<unknown>;

  constructor(db: Db) {
    this.pairs = db.collection<SavedPair>("bookmarking_saved");
  }

  async #ensureIndexes(): Promise<void> {
    this.indexes ??= this.pairs.createIndex({ person: 1, item: 1 }, { unique: true });
    await this.indexes;
  }

  async save(input: { person: string; item: string }): Promise<{ person: string; item: string }> {
    await this.#ensureIndexes();
    try {
      await this.pairs.updateOne(input, { $setOnInsert: input }, { upsert: true });
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    }
    return { ...input };
  }

  async remove(input: { person: string; item: string }): Promise<{ person: string; item: string }> {
    await this.#ensureIndexes();
    await this.pairs.deleteOne(input);
    return { ...input };
  }

  async _saved(input: { person: string }): Promise<{ item: string }[]> {
    return this.pairs.find(input, { projection: { _id: 0, item: 1 } }).sort({ item: 1 }).toArray();
  }
}
