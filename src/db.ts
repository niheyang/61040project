import { MongoClient } from "mongodb";

const url = process.env.MONGODB_URL;
if (!url) throw new Error("MONGODB_URL is missing. Set it in .env locally or in your deployment environment.");

export const client = new MongoClient(url, { serverSelectionTimeoutMS: 3000 });
export const db = client.db();
