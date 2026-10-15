import { randomUUID } from "node:crypto";
import { type Collection, type Db } from "mongodb";

export interface MessageRow {
  message: string;
  sender: string;
  recipient: string;
  text: string;
  createdAt: string;
}

interface MessageDocument extends MessageRow {
  _id: string;
}

export class MessagingError extends Error {
  constructor(public readonly code: "MESSAGE_TO_SELF" | "INVALID_MESSAGE_TEXT") {
    super(code === "MESSAGE_TO_SELF"
      ? "Choose another person as the recipient."
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
      createdAt: new Date().toISOString(),
    });
    return { message };
  }

  async _get(input: { message: string }): Promise<MessageRow[]> {
    const record = await this.messages.findOne({ _id: input.message }, { projection: { _id: 0 } });
    return record ? [record] : [];
  }

  async _sent(input: { user: string }): Promise<MessageRow[]> {
    return this.messages.find({ sender: input.user }, { projection: { _id: 0 } })
      .sort({ createdAt: 1, message: 1 }).toArray();
  }

  async _addressedTo(input: { user: string }): Promise<MessageRow[]> {
    return this.messages.find({ recipient: input.user }, { projection: { _id: 0 } })
      .sort({ createdAt: 1, message: 1 }).toArray();
  }
}
