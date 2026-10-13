import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { analyze, parseCsvText } from "./analyzer.js";
import mysql from "mysql2/promise";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { EJSON } from "bson";

const app = express();
const port = Number(process.env.PORT) || 8789;
const datasetCache = new Map();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.get("/api/health", (_, res) => res.json({ status: "ok" }));
app.get("/api/ai/status", (_, res) => {
  res.json({
    enabled: Boolean(process.env.GEMINI_API_KEY),
    model: "gemini-2.0-flash-lite",
    mode: "light-only",
    note: "AI summaries are only triggered when the user explicitly clicks the button, so there are no automatic background calls.",
  });
});
app.post("/api/ai/summarize", async (req, res) => {
  const { name = "dataset.csv", analysis = null } = req.body || {};

  if (!process.env.GEMINI_API_KEY) {
    return res.status(400).json({
      error: "Gemini is not configured in the local environment.",
    });
  }

  if (!analysis || typeof analysis !== "object") {
    return res
      .status(400)
      .json({ error: "A dataset analysis payload is required." });
  }

  const prompt = [
    `Dataset: ${String(name)}`,
    `Rows: ${analysis.rows ?? 0}`,
    `Columns: ${analysis.columns?.length ?? 0}`,
    `Health score: ${analysis.health ?? 0}/100`,
    `Completeness: ${analysis.completeness ?? 0}%`,
    `Missing cells: ${analysis.missingCells ?? 0}`,
    `Duplicate rows: ${analysis.duplicates ?? 0}`,
    `Top issues: ${
      (analysis.issues || [])
        .slice(0, 3)
        .map((issue) => issue.title)
        .join("; ") || "No major issues detected"
    }`,
    "Give a concise, human-readable 2-3 sentence summary of the dataset quality. Highlight the biggest risk and the most positive signal. Keep it short and avoid speculation.",
  ].join("\n");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 128,
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      },
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload?.error?.message ||
        `Gemini rejected the request (HTTP ${response.status}).`;
      throw new Error(message);
    }

    const text =
      payload?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .join(" ")
        .trim() || "";

    if (!text) {
      throw new Error("Gemini returned an empty summary.");
    }

    res.json({ text, model: "gemini-2.0-flash-lite" });
  } catch (error) {
    res.status(400).json({
      error: `Gemini summary failed: ${error.message || "unknown error"}`,
    });
  }
});
async function listWatchedFiles() {
  const roots = [localWatchDirectory, workspaceRoot];
  const byKey = new Map();

  for (const root of roots) {
    await mkdir(root, { recursive: true });
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.(csv|tsv)$/i.test(entry.name)) continue;
      const filePath = path.join(root, entry.name);
      const info = await stat(filePath);
      const relativePath = path
        .relative(workspaceRoot, filePath)
        .replace(/\\/g, "/");
      const key = relativePath;
      if (!byKey.has(key)) {
        byKey.set(key, {
          name: entry.name,
          path: relativePath,
          size: info.size,
          modifiedAt: info.mtime.toISOString(),
        });
      }
    }
  }

  return [...byKey.values()].sort((a, b) =>
    b.modifiedAt.localeCompare(a.modifiedAt),
  );
}
app.get("/api/local/watch", async (_, res) => {
  const files = await listWatchedFiles();
  res.json({
    folder: localWatchDirectory,
    files,
  });
});
async function loadDatasetFromDisk(filePath) {
  const resolvedPath = path.resolve(filePath);
  const stats = await stat(resolvedPath);
  const cacheKey = `${resolvedPath}:${stats.size}:${stats.mtimeMs}`;

  if (datasetCache.has(cacheKey)) {
    return datasetCache.get(cacheKey);
  }

  const buffer = await readFile(resolvedPath);
  const rows = parseCsvText(
    buffer.toString("utf8"),
    path.basename(resolvedPath),
  );
  if (!rows.length) {
    throw new Error("The file has no header row.");
  }

  const headers = Object.keys(rows[0]);
  const payload = {
    name: path.basename(resolvedPath),
    analysis: analyze(headers, rows),
  };

  datasetCache.set(cacheKey, payload);
  return payload;
}
app.get("/api/local/watch/open", async (req, res) => {
  const requested = String(req.query.path || req.query.name || "").trim();
  const resolvedPath = requested
    ? path.resolve(workspaceRoot, requested)
    : path.join(localWatchDirectory, "dataset.csv");

  if (!requested || resolvedPath.includes("..")) {
    return res.status(400).json({ error: "Invalid file target." });
  }

  try {
    if (resolvedPath.endsWith(".json")) {
      const raw = await readFile(resolvedPath, "utf8");
      const payload = JSON.parse(raw);
      const rows = Array.isArray(payload) ? payload : payload.rows || [];
      if (!rows.length)
        return res.status(400).json({ error: "The JSON file has no rows." });
      const headers = Object.keys(rows[0]);
      return res.json({
        name: path.basename(resolvedPath),
        analysis: analyze(headers, rows),
      });
    }

    const payload = await loadDatasetFromDisk(resolvedPath);
    res.json(payload);
  } catch (error) {
    res.status(404).json({ error: `Could not read file: ${error.message}` });
  }
});
app.get("/api/local/project", async (_, res) => {
  const project = await readLocalProject();
  res.json({ project });
});
app.post("/api/local/project/create", async (req, res) => {
  const { name = "Local Supabase Clone" } = req.body || {};
  const project = await readLocalProject();
  const next = await writeLocalProject({
    ...project,
    name: String(name).trim() || "Local Supabase Clone",
    tables: project.tables?.length
      ? project.tables
      : defaultLocalProject.tables,
  });
  res.json({ project: next });
});
app.post("/api/local/project/import", async (req, res) => {
  const { tableName, columns = [], rows = [] } = req.body || {};
  if (!tableName || !Array.isArray(rows) || !rows.length)
    return res.status(400).json({ error: "Table name and rows are required." });

  const project = await readLocalProject();
  const safeName = normalizeTableName(tableName);
  const headers = (columns.length ? columns : Object.keys(rows[0] || {})).map(
    (column, index) => String(column || `column_${index + 1}`),
  );
  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      headers.map((header) => [
        header,
        row?.[header] ?? row?.[header.trim()] ?? "",
      ]),
    ),
  );
  const existing = project.tables.find((table) => table.name === safeName);
  const table = {
    id: existing?.id || safeName,
    name: safeName,
    columns: headers,
    rows: existing ? [...existing.rows, ...normalizedRows] : normalizedRows,
  };
  const tables = existing
    ? project.tables.map((entry) => (entry.name === safeName ? table : entry))
    : [...project.tables, table];
  const next = await writeLocalProject({ ...project, tables });
  res.json({ project: next, table });
});
app.post("/api/local/query", async (req, res) => {
  const { tableName, action = "list", record = null } = req.body || {};
  if (!tableName)
    return res.status(400).json({ error: "A table name is required." });

  const project = await readLocalProject();
  const table = project.tables.find(
    (entry) => entry.name === normalizeTableName(tableName),
  );
  if (!table)
    return res
      .status(400)
      .json({ error: `Table "${tableName}" was not found.` });

  if (action === "insert" && record && typeof record === "object") {
    const next = await writeLocalProject({
      ...project,
      tables: project.tables.map((entry) =>
        entry.name === table.name
          ? { ...entry, rows: [...entry.rows, record] }
          : entry,
      ),
    });
    return res.json({
      project: next,
      table: next.tables.find((entry) => entry.name === table.name),
    });
  }

  res.json({ table, rows: table.rows });
});
const snapshotDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "snapshots",
);
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const localProjectDirectory = path.resolve(workspaceRoot, "data", "local");
const localWatchDirectory = path.resolve(workspaceRoot, "data", "watched");
const localProjectFile = path.join(localProjectDirectory, "project.json");
const sourceFingerprint = (connectionString) =>
  createHash("sha256").update(connectionString).digest("hex");
const isSnapshotId = (id) =>
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);

const defaultLocalProject = {
  name: "Local Supabase Clone",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  tables: [
    {
      id: "customer_profiles",
      name: "customer_profiles",
      columns: [
        "customer_id",
        "name",
        "age",
        "email",
        "city",
        "annual_spend",
        "segment",
      ],
      rows: [
        {
          customer_id: "C-1001",
          name: "Maya Patel",
          age: "34",
          email: "maya.patel@email.com",
          city: "Mumbai",
          annual_spend: "12400",
          segment: "Premium",
        },
        {
          customer_id: "C-1002",
          name: "Arjun Shah",
          age: "",
          email: "arjun.shah@email.com",
          city: "Delhi",
          annual_spend: "8200",
          segment: "Standard",
        },
        {
          customer_id: "C-1003",
          name: "Neha Iyer",
          age: "29",
          email: "neha.iyer@email.com",
          city: "Bengaluru",
          annual_spend: "15600",
          segment: "Premium",
        },
      ],
    },
  ],
};

async function readLocalProject() {
  await mkdir(localProjectDirectory, { recursive: true });
  try {
    const contents = await readFile(localProjectFile, "utf8");
    const project = JSON.parse(contents);
    if (!project || !Array.isArray(project.tables)) {
      throw new Error("Invalid project file");
    }
    return project;
  } catch {
    await writeFile(
      localProjectFile,
      JSON.stringify(defaultLocalProject, null, 2),
    );
    return structuredClone(defaultLocalProject);
  }
}

function normalizeTableName(value) {
  return (
    String(value || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "untitled_table"
  );
}

async function writeLocalProject(project) {
  await mkdir(localProjectDirectory, { recursive: true });
  const nextProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    tables: (project.tables || []).map((table) => ({
      id: table.id || normalizeTableName(table.name),
      name: table.name || table.id || "untitled_table",
      columns: Array.isArray(table.columns) ? table.columns : [],
      rows: Array.isArray(table.rows) ? table.rows : [],
    })),
  };
  await writeFile(localProjectFile, JSON.stringify(nextProject, null, 2));
  return nextProject;
}
app.post("/api/analyze/file", upload.single("dataset"), (req, res, next) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ error: "Please upload a CSV or TSV file." });
    const rows = parseCsvText(
      req.file.buffer.toString("utf8"),
      req.file.originalname,
    );
    if (!rows.length)
      return res.status(400).json({ error: "The file has no header row." });
    const headers = Object.keys(rows[0]);
    res.json({ name: req.file.originalname, analysis: analyze(headers, rows) });
  } catch (error) {
    next(error);
  }
});
app.post("/api/analyze/records", (req, res) => {
  const { headers, rows } = req.body;
  if (!Array.isArray(headers) || !Array.isArray(rows))
    return res.status(400).json({ error: "headers and rows are required." });
  res.json({ analysis: analyze(headers, rows) });
});
app.post("/api/connections/test", async (req, res) => {
  const { type, config = {} } = req.body;
  const required = {
    supabase: ["url", "key"],
    firebase: ["serviceAccount"],
    mysql: ["host", "user", "password", "database"],
    postgresql: ["connectionString"],
    mongodb: ["connectionString", "database"],
    sqlite: ["path"],
    snowflake: ["account", "username"],
    bigquery: ["projectId"],
  };
  const absent = (required[type] || []).filter((key) => !config[key]);
  if (absent.length)
    return res.status(400).json({ error: `Missing: ${absent.join(", ")}` });
  try {
    if (type === "mysql") {
      const connection = await mysql.createConnection({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        connectTimeout: 8000,
      });
      await connection.ping();
      await connection.end();
    } else if (type === "postgresql") {
      const client = new pg.Client({
        connectionString: config.connectionString,
        connectionTimeoutMillis: 8000,
      });
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
    } else if (type === "supabase") {
      const client = createClient(config.url, config.key, {
        auth: { persistSession: false },
      });
      const { error } = await client
        .from("_clarity_connection_probe")
        .select("*")
        .limit(1);
      // A missing probe table still proves the Supabase API accepted the project/key pair.
      if (
        error &&
        !/relation .* does not exist|Could not find the table/i.test(
          error.message,
        )
      )
        throw error;
    } else if (type === "firebase") {
      const account =
        typeof config.serviceAccount === "string"
          ? JSON.parse(config.serviceAccount)
          : config.serviceAccount;
      const { initializeApp, cert, getApps } =
        await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      const appName = `clarity-${Date.now()}`;
      const firebaseApp = initializeApp({ credential: cert(account) }, appName);
      await getFirestore(firebaseApp).listCollections();
      await firebaseApp.delete();
      void getApps; // Keep SDK import behaviour explicit for server bundlers.
    } else if (type === "mongodb") {
      const client = new MongoClient(config.connectionString, {
        serverSelectionTimeoutMS: 8000,
      });
      await client.connect();
      await client.db(config.database).command({ ping: 1 });
      await client.close();
    } else {
      return res.json({
        ok: true,
        message: `${type} details are structurally valid. Add the provider's server SDK credentials to activate live queries.`,
      });
    }
    res.json({
      ok: true,
      message: `Connection to ${type} was verified successfully.`,
    });
  } catch (error) {
    res.status(400).json({ error: `Could not connect: ${error.message}` });
  }
});
app.post("/api/connections/discover", async (req, res) => {
  const { type, config = {} } = req.body;
  if (type !== "mongodb")
    return res.status(400).json({
      error: "Collection discovery is currently available for MongoDB.",
    });
  if (!config.connectionString || !config.database)
    return res
      .status(400)
      .json({ error: "Connection string and database are required." });
  const client = new MongoClient(config.connectionString, {
    serverSelectionTimeoutMS: 8000,
  });
  try {
    await client.connect();
    const collections = await client
      .db(config.database)
      .listCollections({}, { nameOnly: true })
      .toArray();
    res.json({ collections: collections.map(({ name }) => name) });
  } catch (error) {
    res
      .status(400)
      .json({ error: `Could not discover collections: ${error.message}` });
  } finally {
    await client.close().catch(() => {});
  }
});
app.post("/api/connections/import", async (req, res) => {
  const { type, config = {}, collection } = req.body;
  if (type !== "mongodb")
    return res.status(400).json({
      error: "Local database copies are currently available for MongoDB.",
    });
  if (!config.connectionString || !config.database || !collection)
    return res.status(400).json({
      error: "Connection string, database, and collection are required.",
    });
  const client = new MongoClient(config.connectionString, {
    serverSelectionTimeoutMS: 8000,
  });
  try {
    await client.connect();
    const documents = [];
    for await (const document of client
      .db(config.database)
      .collection(collection)
      .find({})) {
      documents.push(document);
      if (documents.length > 50000)
        throw new Error(
          "This collection exceeds the 50,000-document snapshot limit. No copy was saved.",
        );
    }
    const snapshot = {
      type,
      database: config.database,
      collection,
      sourceFingerprint: sourceFingerprint(config.connectionString),
      importedAt: new Date().toISOString(),
      documentCount: documents.length,
      documents,
    };
    const contents = EJSON.stringify(snapshot);
    if (Buffer.byteLength(contents) > 50 * 1024 * 1024)
      throw new Error(
        "This collection exceeds the 50 MB snapshot limit. No copy was saved.",
      );
    const snapshotId = randomUUID();
    await mkdir(snapshotDirectory, { recursive: true });
    await writeFile(
      path.join(snapshotDirectory, `${snapshotId}.json`),
      contents,
      { flag: "wx" },
    );
    res.json({
      ok: true,
      snapshotId,
      downloadUrl: `/api/snapshots/${snapshotId}`,
      documentCount: documents.length,
    });
  } catch (error) {
    res
      .status(400)
      .json({ error: `Could not save local copy: ${error.message}` });
  } finally {
    await client.close().catch(() => {});
  }
});
app.get("/api/snapshots/:snapshotId", async (req, res) => {
  const { snapshotId } = req.params;
  if (!isSnapshotId(snapshotId))
    return res.status(400).json({ error: "Invalid snapshot id." });
  try {
    const filePath = path.join(snapshotDirectory, `${snapshotId}.json`);
    await readFile(filePath);
    res.download(filePath, `clarity-${snapshotId}.json`);
  } catch (error) {
    res
      .status(error.code === "ENOENT" ? 404 : 500)
      .json({ error: "Saved local copy was not found." });
  }
});
app.post("/api/connections/push-back", async (req, res) => {
  const { snapshotId, config = {}, keyField = "_id" } = req.body;
  if (!isSnapshotId(snapshotId) || !config.connectionString || !config.database)
    return res.status(400).json({
      error:
        "A saved copy and the original MongoDB connection details are required.",
    });
  if (!/^[A-Za-z_][\w.]*$/.test(keyField))
    return res.status(400).json({ error: "Choose a valid key field." });
  let snapshot;
  try {
    snapshot = EJSON.parse(
      await readFile(
        path.join(snapshotDirectory, `${snapshotId}.json`),
        "utf8",
      ),
    );
  } catch (error) {
    return res
      .status(error.code === "ENOENT" ? 404 : 400)
      .json({ error: "Saved local copy could not be read." });
  }
  if (
    snapshot.type !== "mongodb" ||
    snapshot.database !== config.database ||
    snapshot.sourceFingerprint !== sourceFingerprint(config.connectionString)
  )
    return res.status(400).json({
      error:
        "These connection details do not match the database this copy came from.",
    });
  const valueAt = (document, key) =>
    key.split(".").reduce((value, part) => value?.[part], document);
  if (
    snapshot.documents.some(
      (document) =>
        valueAt(document, keyField) === undefined ||
        valueAt(document, keyField) === null,
    )
  )
    return res.status(400).json({
      error: `Every document must contain the selected key: ${keyField}. No records were pushed.`,
    });
  const client = new MongoClient(config.connectionString, {
    serverSelectionTimeoutMS: 8000,
  });
  try {
    await client.connect();
    const target = client.db(config.database).collection(snapshot.collection);
    for (let start = 0; start < snapshot.documents.length; start += 500) {
      const operations = snapshot.documents
        .slice(start, start + 500)
        .map((document) => {
          const fields = { ...document };
          delete fields._id;
          const keyValue = valueAt(document, keyField);
          return {
            updateOne: {
              filter: { [keyField]: keyValue },
              update: {
                $set: fields,
                ...(keyField === "_id" && document._id !== undefined
                  ? { $setOnInsert: { _id: document._id } }
                  : {}),
              },
              upsert: true,
            },
          };
        });
      if (operations.length)
        await target.bulkWrite(operations, { ordered: false });
    }
    res.json({
      ok: true,
      pushed: snapshot.documents.length,
      collection: snapshot.collection,
      keyField,
    });
  } catch (error) {
    res
      .status(400)
      .json({ error: `Could not push copy back: ${error.message}` });
  } finally {
    await client.close().catch(() => {});
  }
});
app.post("/api/connections/analyze", async (req, res) => {
  const { type, config = {}, collection, limit = 1000 } = req.body;
  if (type !== "mongodb")
    return res.status(400).json({
      error: "Collection analysis is currently available for MongoDB.",
    });
  if (!config.connectionString || !config.database || !collection)
    return res.status(400).json({
      error: "Connection string, database, and collection are required.",
    });
  const client = new MongoClient(config.connectionString, {
    serverSelectionTimeoutMS: 8000,
  });
  try {
    await client.connect();
    const docs = await client
      .db(config.database)
      .collection(collection)
      .find({})
      .limit(Math.min(Number(limit) || 1000, 2000))
      .toArray();
    if (!docs.length)
      return res
        .status(400)
        .json({ error: "This collection has no documents to analyze." });
    const headers = [...new Set(docs.flatMap((doc) => Object.keys(doc)))];
    const rows = docs.map((doc) =>
      Object.fromEntries(
        headers.map((header) => {
          const value = doc[header];
          return [
            header,
            value === undefined || value === null
              ? ""
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value),
          ];
        }),
      ),
    );
    res.json({
      name: `${config.database}.${collection}`,
      analysis: analyze(headers, rows),
    });
  } catch (error) {
    res
      .status(400)
      .json({ error: `Could not analyze collection: ${error.message}` });
  } finally {
    await client.close().catch(() => {});
  }
});
app.use((error, _, res, __) =>
  res.status(400).json({ error: error.message || "Request failed." }),
);

const server = app.listen(port, () =>
  console.log(`Clarity API running on ${port}`),
);
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Stop the stale Node process or set a different PORT in your .env file.`,
    );
    process.exit(1);
  }
  throw error;
});
