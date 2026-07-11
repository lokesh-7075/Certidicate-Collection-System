import { MongoClient } from 'mongodb';
import dns from 'dns';

// Set public DNS servers to resolve SRV records properly in Node.js
try {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
} catch (e) {
  // fallback silently
}

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/itcertiod';
const dbName = process.env.MONGODB_DB || 'itcertiod';

let client;
let db;

export async function connectToMongo() {
  if (db) return db;
  client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(dbName);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Mongo not connected. Call connectToMongo() first');
  return db;
}

