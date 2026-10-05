import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { analyze } from './analyzer.js';
import mysql from 'mysql2/promise';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EJSON, MongoClient } from 'mongodb';

const app = express(); const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.use(cors()); app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
const snapshotDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'snapshots');
const sourceFingerprint = (connectionString) => createHash('sha256').update(connectionString).digest('hex');
const isSnapshotId = (id) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);
app.post('/api/analyze/file', upload.single('dataset'), (req, res, next) => {
  try { if (!req.file) return res.status(400).json({ error: 'Please upload a CSV or TSV file.' }); const delimiter = req.file.originalname.endsWith('.tsv') ? '\t' : ','; const rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true, delimiter }); const headers = Object.keys(rows[0] || {}); if (!headers.length) return res.status(400).json({ error: 'The file has no header row.' }); res.json({ name: req.file.originalname, analysis: analyze(headers, rows) }); } catch (error) { next(error); }
});
app.post('/api/analyze/records', (req, res) => { const { headers, rows } = req.body; if (!Array.isArray(headers) || !Array.isArray(rows)) return res.status(400).json({ error: 'headers and rows are required.' }); res.json({ analysis: analyze(headers, rows) }); });
app.post('/api/connections/test', async (req, res) => {
  const { type, config = {} } = req.body; const required = { supabase: ['url', 'key'], firebase: ['serviceAccount'], mysql: ['host', 'user', 'password', 'database'], postgresql: ['connectionString'], mongodb: ['connectionString', 'database'], sqlite: ['path'], snowflake: ['account', 'username'], bigquery: ['projectId'] };
  const absent = (required[type] || []).filter((key) => !config[key]);
  if (absent.length) return res.status(400).json({ error: `Missing: ${absent.join(', ')}` });
  try {
    if (type === 'mysql') {
      const connection = await mysql.createConnection({ host: config.host, user: config.user, password: config.password, database: config.database, connectTimeout: 8000 });
      await connection.ping(); await connection.end();
    } else if (type === 'postgresql') {
      const client = new pg.Client({ connectionString: config.connectionString, connectionTimeoutMillis: 8000 });
      await client.connect(); await client.query('SELECT 1'); await client.end();
    } else if (type === 'supabase') {
      const client = createClient(config.url, config.key, { auth: { persistSession: false } });
      const { error } = await client.from('_clarity_connection_probe').select('*').limit(1);
      // A missing probe table still proves the Supabase API accepted the project/key pair.
      if (error && !/relation .* does not exist|Could not find the table/i.test(error.message)) throw error;
    } else if (type === 'firebase') {
      const account = typeof config.serviceAccount === 'string' ? JSON.parse(config.serviceAccount) : config.serviceAccount;
      const { initializeApp, cert, getApps } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      const appName = `clarity-${Date.now()}`;
      const firebaseApp = initializeApp({ credential: cert(account) }, appName);
      await getFirestore(firebaseApp).listCollections();
      await firebaseApp.delete();
      void getApps; // Keep SDK import behaviour explicit for server bundlers.
    } else if (type === 'mongodb') {
      const client = new MongoClient(config.connectionString, { serverSelectionTimeoutMS: 8000 });
      await client.connect(); await client.db(config.database).command({ ping: 1 }); await client.close();
    } else {
      return res.json({ ok: true, message: `${type} details are structurally valid. Add the provider's server SDK credentials to activate live queries.` });
    }
    res.json({ ok: true, message: `Connection to ${type} was verified successfully.` });
  } catch (error) { res.status(400).json({ error: `Could not connect: ${error.message}` }); }
});
app.post('/api/connections/discover', async (req, res) => {
  const { type, config = {} } = req.body;
  if (type !== 'mongodb') return res.status(400).json({ error: 'Collection discovery is currently available for MongoDB.' });
  if (!config.connectionString || !config.database) return res.status(400).json({ error: 'Connection string and database are required.' });
  const client = new MongoClient(config.connectionString, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const collections = await client.db(config.database).listCollections({}, { nameOnly: true }).toArray();
    res.json({ collections: collections.map(({ name }) => name) });
  } catch (error) { res.status(400).json({ error: `Could not discover collections: ${error.message}` }); }
  finally { await client.close().catch(() => {}); }
});
app.post('/api/connections/import', async (req, res) => {
  const { type, config = {}, collection } = req.body;
  if (type !== 'mongodb') return res.status(400).json({ error: 'Local database copies are currently available for MongoDB.' });
  if (!config.connectionString || !config.database || !collection) return res.status(400).json({ error: 'Connection string, database, and collection are required.' });
  const client = new MongoClient(config.connectionString, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const documents = [];
    for await (const document of client.db(config.database).collection(collection).find({})) {
      documents.push(document);
      if (documents.length > 50000) throw new Error('This collection exceeds the 50,000-document snapshot limit. No copy was saved.');
    }
    const snapshot = { type, database: config.database, collection, sourceFingerprint: sourceFingerprint(config.connectionString), importedAt: new Date().toISOString(), documentCount: documents.length, documents };
    const contents = EJSON.stringify(snapshot);
    if (Buffer.byteLength(contents) > 50 * 1024 * 1024) throw new Error('This collection exceeds the 50 MB snapshot limit. No copy was saved.');
    const snapshotId = randomUUID();
    await mkdir(snapshotDirectory, { recursive: true });
    await writeFile(path.join(snapshotDirectory, `${snapshotId}.json`), contents, { flag: 'wx' });
    res.json({ ok: true, snapshotId, downloadUrl: `/api/snapshots/${snapshotId}`, documentCount: documents.length });
  } catch (error) { res.status(400).json({ error: `Could not save local copy: ${error.message}` }); }
  finally { await client.close().catch(() => {}); }
});
app.get('/api/snapshots/:snapshotId', async (req, res) => {
  const { snapshotId } = req.params;
  if (!isSnapshotId(snapshotId)) return res.status(400).json({ error: 'Invalid snapshot id.' });
  try {
    const filePath = path.join(snapshotDirectory, `${snapshotId}.json`);
    await readFile(filePath);
    res.download(filePath, `clarity-${snapshotId}.json`);
  } catch (error) { res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: 'Saved local copy was not found.' }); }
});
app.post('/api/connections/push-back', async (req, res) => {
  const { snapshotId, config = {}, keyField = '_id' } = req.body;
  if (!isSnapshotId(snapshotId) || !config.connectionString || !config.database) return res.status(400).json({ error: 'A saved copy and the original MongoDB connection details are required.' });
  if (!/^[A-Za-z_][\w.]*$/.test(keyField)) return res.status(400).json({ error: 'Choose a valid key field.' });
  let snapshot;
  try {
    snapshot = EJSON.parse(await readFile(path.join(snapshotDirectory, `${snapshotId}.json`), 'utf8'));
  } catch (error) { return res.status(error.code === 'ENOENT' ? 404 : 400).json({ error: 'Saved local copy could not be read.' }); }
  if (snapshot.type !== 'mongodb' || snapshot.database !== config.database || snapshot.sourceFingerprint !== sourceFingerprint(config.connectionString)) return res.status(400).json({ error: 'These connection details do not match the database this copy came from.' });
  const valueAt = (document, key) => key.split('.').reduce((value, part) => value?.[part], document);
  if (snapshot.documents.some((document) => valueAt(document, keyField) === undefined || valueAt(document, keyField) === null)) return res.status(400).json({ error: `Every document must contain the selected key: ${keyField}. No records were pushed.` });
  const client = new MongoClient(config.connectionString, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const target = client.db(config.database).collection(snapshot.collection);
    for (let start = 0; start < snapshot.documents.length; start += 500) {
      const operations = snapshot.documents.slice(start, start + 500).map((document) => {
        const fields = { ...document }; delete fields._id;
        const keyValue = valueAt(document, keyField);
        return { updateOne: { filter: { [keyField]: keyValue }, update: { $set: fields, ...(keyField === '_id' && document._id !== undefined ? { $setOnInsert: { _id: document._id } } : {}) }, upsert: true } };
      });
      if (operations.length) await target.bulkWrite(operations, { ordered: false });
    }
    res.json({ ok: true, pushed: snapshot.documents.length, collection: snapshot.collection, keyField });
  } catch (error) { res.status(400).json({ error: `Could not push copy back: ${error.message}` }); }
  finally { await client.close().catch(() => {}); }
});
app.post('/api/connections/analyze', async (req, res) => {
  const { type, config = {}, collection, limit = 1000 } = req.body;
  if (type !== 'mongodb') return res.status(400).json({ error: 'Collection analysis is currently available for MongoDB.' });
  if (!config.connectionString || !config.database || !collection) return res.status(400).json({ error: 'Connection string, database, and collection are required.' });
  const client = new MongoClient(config.connectionString, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const docs = await client.db(config.database).collection(collection).find({}).limit(Math.min(Number(limit) || 1000, 2000)).toArray();
    if (!docs.length) return res.status(400).json({ error: 'This collection has no documents to analyze.' });
    const headers = [...new Set(docs.flatMap((doc) => Object.keys(doc)))];
    const rows = docs.map((doc) => Object.fromEntries(headers.map((header) => {
      const value = doc[header]; return [header, value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)];
    })));
    res.json({ name: `${config.database}.${collection}`, analysis: analyze(headers, rows) });
  } catch (error) { res.status(400).json({ error: `Could not analyze collection: ${error.message}` }); }
  finally { await client.close().catch(() => {}); }
});
app.use((error, _, res, __) => res.status(400).json({ error: error.message || 'Request failed.' }));
app.listen(process.env.PORT || 8787, () => console.log(`Clarity API running on ${process.env.PORT || 8787}`));
