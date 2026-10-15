import { MongoServerError, type Collection, type Db } from "mongodb";

export class InvalidUsername extends Error {}
export class InvalidPassword extends Error {}
export class UsernameTaken extends Error {}
export class InvalidCredentials extends Error {}

interface UserRecord {
  _id: string;
  username: string;
  passwordHash: string;
}

export class PasswordAuthenticatingConcept {
  private readonly users: Collection<UserRecord>;
  private ready?: Promise<string>;

  constructor(db: Db) {
    this.users = db.collection<UserRecord>("auth.users");
  }

  async register({ username, password }: { username: string; password: string }) {
    const canonical = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(canonical)) throw new InvalidUsername();
    if (password.length < 8 || password.length > 128) throw new InvalidPassword();
    this.ready ??= this.users.createIndex({ username: 1 }, { unique: true });
    await this.ready;
    const user = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });
    try {
      await this.users.insertOne({ _id: user, username: canonical, passwordHash });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) throw new UsernameTaken();
      throw error;
    }
    return { user, username: canonical };
  }

  async authenticate({ username, password }: { username: string; password: string }) {
    const record = await this.users.findOne({ username: username.trim().toLowerCase() });
    if (!record || !(await Bun.password.verify(password, record.passwordHash))) {
      throw new InvalidCredentials();
    }
    return { user: record._id, username: record.username };
  }

  async _byUsername({ username }: { username: string }) {
    const record = await this.users.findOne({ username: username.trim().toLowerCase() });
    return record ? [{ user: record._id }] : [];
  }

  async _name({ user }: { user: string }) {
    const record = await this.users.findOne({ _id: user });
    return record ? [{ username: record.username }] : [];
  }
}
