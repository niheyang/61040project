import { MongoClient } from "mongodb";

const url = process.env.MONGODB_URL;
if (!url) throw new Error("MONGODB_URL is missing. Copy .env.example to .env.");

export const client = new MongoClient(url, { serverSelectionTimeoutMS: 3000 });
export const db = client.db();
