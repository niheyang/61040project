import { randomUUID } from "node:crypto";
import { type Collection, type Db } from "mongodb";
import { normalizeDrawing, type Drawing } from "../shared/drawing.ts";

export interface MessageRow {
  message: string;
  sender: string;
  recipient: string;
  text: string;
  drawing: Drawing | null;
  createdAt: string;
}

interface MessageDocument extends Omit<MessageRow, "drawing"> {
  _id: string;
  // Existing text messages have no drawing field; no data migration is needed.
  drawing?: Drawing | null;
}

export class MessagingError extends Error {
  constructor(public readonly code: "MESSAGE_TO_SELF" | "INVALID_MESSAGE_TEXT" | "INVALID_DRAWING") {
    super(code === "MESSAGE_TO_SELF"
      ? "Choose another person as the recipient."
      : code === "INVALID_DRAWING"
        ? "Draw something before sending, and keep the drawing within the size limit."
        : "Write a message of 1–2,000 characters.");
    this.name = "MessagingError";
  }
}

export class MessageToSelf extends MessagingError {
  constructor() {
    super("MESSAGE_TO_SELF");
    this.name = "MessageToSelf";
  }
}

export class InvalidMessageText extends MessagingError {
  constructor() {
    super("INVALID_MESSAGE_TEXT");
    this.name = "InvalidMessageText";
  }
}

export class InvalidDrawing extends MessagingError {
  constructor() {
    super("INVALID_DRAWING");
    this.name = "InvalidDrawing";
  }
}

export class Messaging {
  private readonly messages: Collection<MessageDocument>;
  private indexes?: Promise<unknown>;

  constructor(db: Db) {
    this.messages = db.collection<MessageDocument>("messaging_messages");
  }

  async #ensureIndexes(): Promise<void> {
    this.indexes ??= this.messages.createIndexes([
      { key: { sender: 1, createdAt: 1 } },
      { key: { recipient: 1, createdAt: 1 } },
    ]);
    await this.indexes;
  }

  async send(input: { sender: string; recipient: string; text: string }): Promise<{ message: string }> {
    if (input.sender === input.recipient) throw new MessageToSelf();
    const text = input.text.trim();
    if (text.length < 1 || text.length > 2_000) throw new InvalidMessageText();
    await this.#ensureIndexes();
    const message = randomUUID();
    await this.messages.insertOne({
      _id: message,
      message,
      sender: input.sender,
      recipient: input.recipient,
      text,
      drawing: null,
      createdAt: new Date().toISOString(),
    });
    return { message };
  }

  async sendDrawing(input: { sender: string; recipient: string; drawing: Drawing }): Promise<{ message: string }> {
    if (input.sender === input.recipient) throw new MessageToSelf();
    // Validate again here: concept actions also need to refuse malformed direct calls.
    const drawing = normalizeDrawing(input.drawing);
    if (!drawing) throw new InvalidDrawing();
    await this.#ensureIndexes();
    const message = randomUUID();
    await this.messages.insertOne({
      _id: message,
      message,
      sender: input.sender,
      recipient: input.recipient,
      text: "",
      drawing,
      createdAt: new Date().toISOString(),
    });
    return { message };
  }

  #messageRow(record: MessageDocument): MessageRow {
    return {
      message: record.message,
      sender: record.sender,
      recipient: record.recipient,
      text: record.text,
      drawing: record.drawing ?? null,
      createdAt: record.createdAt,
    };
  }

  async _get(input: { message: string }): Promise<MessageRow[]> {
    const record = await this.messages.findOne({ _id: input.message }, { projection: { _id: 0 } });
    return record ? [this.#messageRow(record)] : [];
  }

  async _sent(input: { user: string }): Promise<MessageRow[]> {
    const records = await this.messages.find({ sender: input.user }, { projection: { _id: 0 } })
      .sort({ createdAt: 1, message: 1 }).toArray();
    return records.map((record) => this.#messageRow(record));
  }

  async _addressedTo(input: { user: string }): Promise<MessageRow[]> {
    const records = await this.messages.find({ recipient: input.user }, { projection: { _id: 0 } })
      .sort({ createdAt: 1, message: 1 }).toArray();
    return records.map((record) => this.#messageRow(record));
  }
}
