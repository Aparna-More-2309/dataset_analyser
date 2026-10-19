import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Database,
  FileUp,
  LayoutDashboard,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import "./index.css";
import { analyze, parseCsvText } from "./lib/data-analysis.js";

const sample = {
  headers: [
    "customer_id",
    "name",
    "age",
    "email",
    "city",
    "annual_spend",
    "segment",
  ],
  rows: [
    [
      "C-1001",
      "Maya Patel",
      "34",
      "maya.patel@email.com",
      "Mumbai",
      "12400",
      "Premium",
    ],
    [
      "C-1002",
      "Arjun Shah",
      "",
      "arjun.shah@email.com",
      "Delhi",
      "8200",
      "Standard",
    ],
    [
      "C-1003",
      "Neha Iyer",
      "29",
      "neha.iyer@email.com",
      "Bengaluru",
      "15600",
      "Premium",
    ],
    [
      "C-1004",
      "Rohan Mehta",
      "42",
      "rohan.mehta@email.com",
      "",
      "9700",
      "Standard",
    ],
    [
      "C-1005",
      "Aditi Rao",
      "31",
      "invalid-email",
      "Chennai",
      "11800",
      "Premium",
    ],
    [
      "C-1006",
      "Karan Singh",
      "150",
      "karan.singh@email.com",
      "Mumbai",
      "10500",
      "Standard",
    ],
    ["C-1007", "Meera Nair", "27", "meera.nair@email.com", "Kochi", "", "New"],
    [
      "C-1008",
      "Vikram Das",
      "38",
      "vikram.das@email.com",
      "Delhi",
      "9100",
      "Standard",
    ],
    [
      "C-1008",
      "Vikram Das",
      "38",
      "vikram.das@email.com",
      "Delhi",
      "9100",
      "Standard",
    ],
    ["C-1010", "Isha Gupta", "", "", "Pune", "7200", "New"],
    [
      "C-1011",
      "Riya Bose",
      "33",
      "riya.bose@email.com",
      "Mumbai",
      "999999",
      "Premium",
    ],
  ],
};
const providers = [
  {
    id: "local",
    name: "Local Studio",
    note: "Supabase-style, no keys required",
    fields: [],
  },
  {
    id: "supabase",
    name: "Supabase",
    note: "Postgres + auth",
    fields: [
      ["url", "Project URL"],
      ["key", "Service role key"],
    ],
  },
  {
    id: "firebase",
    name: "Firebase",
    note: "Firestore / Realtime DB",
    fields: [["serviceAccount", "Service account JSON"]],
  },
  {
    id: "mysql",
    name: "MySQL",
    note: "Relational database",
    fields: [
      ["host", "Host"],
      ["user", "User"],
      ["password", "Password"],
      ["database", "Database"],
    ],
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    note: "Relational database",
    fields: [["connectionString", "Connection string"]],
  },
  {
    id: "mongodb",
    name: "MongoDB",
    note: "Document database",
    fields: [
      ["connectionString", "Connection string"],
      ["database", "Database"],
    ],
  },
  {
    id: "sqlite",
    name: "SQLite",
    note: "Local file database",
    fields: [["path", "Database path"]],
  },
  {
    id: "snowflake",
    name: "Snowflake",
    note: "Cloud warehouse",
    fields: [
      ["account", "Account"],
      ["username", "Username"],
    ],
  },
  {
    id: "bigquery",
    name: "BigQuery",
    note: "Google warehouse",
    fields: [["projectId", "Project ID"]],
  },
];
function samplePayload() {
  return {
    headers: sample.headers,
    rows: sample.rows.map((row) =>
      Object.fromEntries(sample.headers.map((h, i) => [h, row[i]])),
    ),
  };
}
function Metric({ title, value, note, color = "text-slate-500" }) {
  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-5'>
      <p className='text-xs font-bold text-slate-500'>{title}</p>
      <p className='mt-2 text-3xl font-extrabold tracking-tight'>{value}</p>
      <p className={`mt-1 text-xs ${color}`}>{note}</p>
    </div>
  );
}
function DataProfile({ analysis, filename }) {
  const relationships = analysis?.pivotRelationships || [];

  if (!analysis)
    return (
      <div className='grid min-h-[440px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white'>
        <div className='text-center'>
          <Database className='mx-auto h-10 w-10 text-brand' />
          <h2 className='mt-4 text-xl font-bold'>No dataset selected</h2>
          <p className='mt-2 text-sm text-slate-500'>
            Upload a CSV or use the demo dataset to begin.
          </p>
        </div>
      </div>
    );

  if (!relationships.length) {
    return (
      <div className='rounded-2xl border border-slate-200 bg-white p-8 text-center'>
        <h2 className='text-xl font-extrabold'>
          No strong pivot relationships found
        </h2>
        <p className='mt-2 text-sm text-slate-500'>
          This dataset is too sparse or uniform to surface a meaningful profile
          yet.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5'>
        <div>
          <p className='text-xs font-bold uppercase tracking-[.16em] text-brand'>
            Data profile
          </p>
          <h2 className='mt-1 text-xl font-extrabold'>
            {filename || "Dataset"}
          </h2>
        </div>
        <div className='rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-brand'>
          Top {relationships.length} relationships
        </div>
      </div>

      {relationships.map((relationship, index) => {
        const maxValue = Math.max(
          ...relationship.matrix.flatMap((row) =>
            row.values.map((cell) => cell.value),
          ),
          1,
        );

        return (
          <section
            key={`${relationship.left}-${relationship.right}`}
            className='rounded-2xl border border-slate-200 bg-white p-5'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='text-[10px] font-bold uppercase tracking-[.16em] text-slate-400'>
                  Relationship #{index + 1}
                </p>
                <h3 className='mt-1 text-xl font-extrabold'>
                  {relationship.left} × {relationship.right}
                </h3>
              </div>
              <span className='rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700'>
                Strength {relationship.score.toFixed(2)}
              </span>
            </div>

            <div className='mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.6fr]'>
              <div className='overflow-x-auto'>
                <table className='min-w-full border-separate border-spacing-y-2 text-left text-xs'>
                  <thead>
                    <tr>
                      <th className='px-2 py-1 font-bold text-slate-500'>
                        {relationship.left}
                      </th>
                      {relationship.columnLabels.map((label) => (
                        <th
                          key={label}
                          className='px-2 py-1 text-center font-bold text-slate-500'>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {relationship.matrix.map((row) => (
                      <tr key={row.label}>
                        <th className='whitespace-nowrap px-2 py-2 text-left font-bold text-slate-700'>
                          {row.label}
                        </th>
                        {row.values.map((cell) => (
                          <td
                            key={`${row.label}-${cell.label}`}
                            className='px-2 py-2'>
                            <div className='w-20 min-w-[80px]'>
                              <div className='mb-1 flex items-center justify-between text-[10px] text-slate-500'>
                                <span>{cell.value}</span>
                                <span>
                                  {Math.round((cell.value / maxValue) * 100)}%
                                </span>
                              </div>
                              <div className='h-2.5 overflow-hidden rounded-full bg-slate-100'>
                                <div
                                  className='h-full rounded-full bg-gradient-to-r from-brand to-indigo-400'
                                  style={{
                                    width: `${(cell.value / maxValue) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className='rounded-xl border border-slate-200 bg-slate-50 p-4'>
                <p className='text-[10px] font-bold uppercase tracking-[.16em] text-slate-500'>
                  Distribution insight
                </p>
                <div className='mt-4 space-y-3'>
                  {relationship.matrix
                    .slice()
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 4)
                    .map((row) => (
                      <div key={row.label}>
                        <div className='mb-1 flex items-center justify-between text-xs'>
                          <span className='font-bold text-slate-700'>
                            {row.label}
                          </span>
                          <span className='font-mono text-slate-500'>
                            {row.total}
                          </span>
                        </div>
                        <div className='h-2 overflow-hidden rounded-full bg-slate-200'>
                          <div
                            className='h-full rounded-full bg-brand'
                            style={{
                              width: `${(row.total / relationship.rows) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Overview({ analysis, filename }) {
  if (!analysis)
    return (
      <div className='grid min-h-[440px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white'>
        <div className='text-center'>
          <Database className='mx-auto h-10 w-10 text-brand' />
          <h2 className='mt-4 text-xl font-bold'>No dataset selected</h2>
          <p className='mt-2 text-sm text-slate-500'>
            Upload a CSV or use the demo dataset to begin.
          </p>
        </div>
      </div>
    );
  const max = Math.max(...analysis.columns.map((c) => c.missing), 1);
  return (
    <>
      <div className='mb-5 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4'>
        <div className='flex items-center gap-3'>
          <span className='grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-brand'>
            <Table2 size={19} />
          </span>
          <div>
            <p className='font-bold'>{filename}</p>
            <p className='text-xs text-slate-500'>
              {analysis.rows.toLocaleString()} rows · {analysis.columns.length}{" "}
              columns
            </p>
          </div>
        </div>
        <span className='rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700'>
          Analysis complete
        </span>
      </div>
      <div className='grid gap-4 md:grid-cols-4'>
        <div className='rounded-2xl border border-slate-200 bg-white p-5 md:col-span-1'>
          <p className='text-xs font-bold text-slate-500'>
            Overall data health
          </p>
          <div className='mt-4 flex items-center gap-3'>
            <div className='grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-xl font-extrabold text-emerald-700 ring-8 ring-emerald-100'>
              {analysis.health}
            </div>
            <div>
              <p className='font-bold'>
                {analysis.health > 80 ? "Good shape" : "Needs attention"}
              </p>
              <p className='text-xs text-slate-500'>Quality score / 100</p>
            </div>
          </div>
        </div>
        <Metric
          title='Completeness'
          value={`${analysis.completeness}%`}
          note={`${analysis.missingCells} missing cells`}
          color={analysis.missingCells ? "text-amber-600" : "text-emerald-600"}
        />
        <Metric
          title='Issues found'
          value={analysis.issues.length}
          note={`${analysis.issues.filter((i) => i.level === "high").length} high priority`}
          color='text-amber-600'
        />
        <Metric
          title='Duplicate records'
          value={analysis.duplicates}
          note={analysis.duplicates ? "Review before use" : "No duplicate rows"}
          color={analysis.duplicates ? "text-rose-600" : "text-emerald-600"}
        />
      </div>
      <div className='mt-5 grid gap-5 lg:grid-cols-5'>
        <section className='rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-3'>
          <div className='mb-3 flex items-center justify-between'>
            <h2 className='font-bold'>Impurities & anomalies</h2>
            <span className='rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-500'>
              {analysis.issues.length} FOUND
            </span>
          </div>
          <div className='divide-y divide-slate-100'>
            {analysis.issues.slice(0, 6).map((issue, i) => (
              <div key={i} className='flex gap-3 py-3'>
                <span
                  className={`mt-0.5 grid h-8 w-8 place-items-center rounded-lg ${issue.level === "high" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>
                  <AlertTriangle size={15} />
                </span>
                <div className='flex-1'>
                  <p className='text-sm font-bold'>{issue.title}</p>
                  <p className='mt-0.5 text-xs text-slate-500'>
                    {issue.detail}
                  </p>
                </div>
                <span
                  className={`h-fit rounded-full px-2 py-1 text-[10px] font-bold ${issue.level === "high" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>
                  {issue.level.toUpperCase()}
                </span>
              </div>
            ))}
            {!analysis.issues.length && (
              <p className='py-10 text-center text-sm text-emerald-600'>
                No impurities found.
              </p>
            )}
          </div>
        </section>
        <section className='rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2'>
          <h2 className='font-bold'>Missing data by column</h2>
          <div className='mt-4 space-y-4'>
            {[...analysis.columns]
              .sort((a, b) => b.missing - a.missing)
              .map((c) => (
                <div key={c.name}>
                  <div className='mb-1.5 flex justify-between text-xs'>
                    <span className='font-semibold'>{c.name}</span>
                    <span className='font-mono text-slate-500'>
                      {c.missing} ·{" "}
                      {Math.round((c.missing / analysis.rows) * 100)}%
                    </span>
                  </div>
                  <div className='h-2 overflow-hidden rounded-full bg-slate-100'>
                    <div
                      className='h-full rounded-full bg-brand'
                      style={{ width: `${(c.missing / max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
      <div className='mt-5 grid gap-5 lg:grid-cols-5'>
        <section className='overflow-hidden rounded-2xl border border-slate-200 bg-white lg:col-span-3'>
          <div className='border-b border-slate-100 p-5'>
            <h2 className='font-bold'>Column cleanup recommendations</h2>
            <p className='mt-1 text-xs text-slate-500'>
              Recommendations use completeness and uniqueness signals.
            </p>
          </div>
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-sm'>
              <thead className='bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500'>
                <tr>
                  <th className='px-5 py-3'>Column</th>
                  <th className='px-5 py-3'>Distinct</th>
                  <th className='px-5 py-3'>Missing</th>
                  <th className='px-5 py-3'>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {analysis.columns.map((c) => (
                  <tr key={c.name} className='border-t border-slate-100'>
                    <td className='px-5 py-3 font-bold'>{c.name}</td>
                    <td className='px-5 py-3 text-slate-500'>{c.unique}</td>
                    <td className='px-5 py-3 text-slate-500'>{c.missing}</td>
                    <td className='px-5 py-3'>
                      <span
                        className={`rounded px-2 py-1 text-[10px] font-bold ${c.suggestion.startsWith("Remove") ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {c.suggestion}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className='rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2'>
          <h2 className='font-bold'>Incomplete rows</h2>
          <p className='mt-1 text-xs text-slate-500'>
            Rows that need review before analysis.
          </p>
          <div className='mt-3 divide-y divide-slate-100'>
            {analysis.incompleteRows.slice(0, 5).map((row) => (
              <div key={row.index} className='flex items-center gap-3 py-3'>
                <span className='rounded bg-slate-100 px-2 py-1 font-mono text-[10px]'>
                  #{row.index}
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='text-xs font-bold'>
                    {row.missing.length} missing field
                    {row.missing.length > 1 ? "s" : ""}
                  </p>
                  <p className='truncate text-[11px] text-slate-500'>
                    {row.missing.join(", ")}
                  </p>
                </div>
                <ChevronRight size={15} className='text-slate-400' />
              </div>
            ))}
            {!analysis.incompleteRows.length && (
              <p className='py-8 text-center text-sm text-emerald-600'>
                Every row is complete.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
async function readApiResponse(response) {
  const body = await response.text();
  if (!body)
    throw new Error(
      `The API returned an empty response (HTTP ${response.status}). Make sure the API server is running on port 8787.`,
    );
  let result;
  try {
    result = JSON.parse(body);
  } catch {
    throw new Error(
      `The API returned an invalid response (HTTP ${response.status}). Make sure the API server is running on port 8787.`,
    );
  }
  if (!response.ok)
    throw new Error(
      result.error || `The API request failed (HTTP ${response.status}).`,
    );
  return result;
}

function MongoActions({ config, onAnalyzed }) {
  const [collections, setCollections] = useState([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [keyField, setKeyField] = useState("_id");
  const request = async (url, body) => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return await readApiResponse(response);
    } catch (error) {
      if (error instanceof TypeError)
        throw new Error(
          "Could not reach the API server. Make sure it is running on port 8787.",
        );
      throw error;
    }
  };
  const discover = async () => {
    setBusy(true);
    setMessage("");
    setSnapshot(null);
    try {
      const result = await request("/api/connections/discover", {
        type: "mongodb",
        config,
      });
      setCollections(result.collections);
      setSelected(result.collections[0] || "");
      setMessage(
        result.collections.length
          ? "Choose a collection to analyze or save a local copy."
          : "No collections found.",
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  const analyzeCollection = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await request("/api/connections/analyze", {
        type: "mongodb",
        config,
        collection: selected,
      });
      window.sessionStorage.setItem(
        "clarity-last-analysis",
        JSON.stringify(result),
      );
      window.dispatchEvent(
        new CustomEvent("clarity-analysis-ready", { detail: result }),
      );
      onAnalyzed?.(result);
      setMessage("Analysis complete.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  const saveLocalCopy = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage("Verifying connection and saving a full local copy…");
    try {
      await request("/api/connections/test", { type: "mongodb", config });
      const result = await request("/api/connections/import", {
        type: "mongodb",
        config,
        collection: selected,
      });
      setSnapshot(result);
      const link = document.createElement("a");
      link.href = result.downloadUrl;
      link.download = `clarity-${result.snapshotId}.json`;
      link.click();
      setMessage(
        `Saved ${result.documentCount.toLocaleString()} documents locally and started the download.`,
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  const pushBack = async () => {
    if (
      !snapshot ||
      !window.confirm(
        `Push ${snapshot.documentCount.toLocaleString()} saved documents back to ${config.database}.${selected}, upserting by "${keyField}"? Matching records will be updated and new records inserted. Other records will not be deleted.`,
      )
    )
      return;
    setBusy(true);
    setMessage("Pushing the saved copy back to MongoDB…");
    try {
      const result = await request("/api/connections/push-back", {
        snapshotId: snapshot.snapshotId,
        config,
        keyField,
      });
      setMessage(
        `Pushed ${result.pushed.toLocaleString()} documents using ${result.keyField}.`,
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className='mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3'>
      <p className='text-xs font-bold text-indigo-900'>MongoDB collection</p>
      <button
        onClick={discover}
        disabled={busy}
        className='mt-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-brand'>
        {busy ? "Working…" : "Find collections"}
      </button>
      {collections.length > 0 && (
        <div className='mt-3 space-y-2'>
          <div className='flex gap-2'>
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setSnapshot(null);
              }}
              className='min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-2 text-xs'>
              {collections.map((collection) => (
                <option key={collection}>{collection}</option>
              ))}
            </select>
            <button
              onClick={analyzeCollection}
              disabled={busy}
              className='rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white'>
              Analyze
            </button>
          </div>
          <button
            onClick={saveLocalCopy}
            disabled={busy}
            className='rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-brand'>
            Verify and save full local copy
          </button>
          {snapshot && (
            <div className='space-y-2 rounded-lg border border-indigo-100 bg-white p-3'>
              <a
                href={snapshot.downloadUrl}
                download
                className='block text-xs font-bold text-brand underline'>
                Download saved JSON copy
              </a>
              <label className='block text-xs font-semibold text-slate-600'>
                Upsert key field
                <input
                  value={keyField}
                  onChange={(e) => setKeyField(e.target.value)}
                  className='mt-1 w-full rounded border border-slate-200 px-2 py-1.5 font-normal'
                />
              </label>
              <button
                onClick={pushBack}
                disabled={busy || !keyField.trim()}
                className='rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white disabled:opacity-50'>
                Push saved copy back
              </button>
            </div>
          )}
        </div>
      )}
      {message && (
        <p aria-live='polite' className='mt-2 text-[11px] text-slate-600'>
          {message}
        </p>
      )}
    </div>
  );
}
function LocalStudio({ onAnalyzed }) {
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Local project ready for no-key development.",
  );

  const getProject = async () => {
    const response = await fetch("/api/local/project");
    const data = await readApiResponse(response);
    setProject(data.project);
    return data.project;
  };

  const createProject = async () => {
    setBusy(true);
    setMessage("Creating your local Supabase-style project…");
    try {
      const response = await fetch("/api/local/project/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Local Supabase Clone" }),
      });
      const data = await readApiResponse(response);
      setProject(data.project);
      setMessage("Local project created successfully.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const openProject = async () => {
    setBusy(true);
    try {
      const current = await getProject();
      const table = current.tables?.[0];
      if (!table || !table.rows?.length) {
        setMessage("No tables are available in the local project yet.");
        return;
      }
      const rows = table.rows.map((row) =>
        Object.fromEntries(
          table.columns.map((column) => [column, row?.[column] ?? ""]),
        ),
      );
      onAnalyzed?.({
        name: table.name,
        analysis: analyze(table.columns, rows),
      });
      setMessage(`Opened ${table.name} from the local studio.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsvText(text, file.name);
      if (!rows.length) {
        setMessage("This file does not contain usable CSV rows.");
        return;
      }
      const tableName = file.name.replace(/\.[^.]+$/, "") || "uploaded_data";
      const response = await fetch("/api/local/project/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableName,
          columns: Object.keys(rows[0]),
          rows,
        }),
      });
      const data = await readApiResponse(response);
      setProject(data.project);
      onAnalyzed?.({
        name: tableName,
        analysis: analyze(Object.keys(rows[0]), rows),
      });
      setMessage(`Imported ${rows.length} rows into ${tableName}.`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    getProject().catch(() => setProject(null));
  }, []);

  return (
    <div className='space-y-4'>
      <div>
        <h3 className='text-lg font-bold'>Local Supabase-style project</h3>
        <p className='mt-1 text-sm text-slate-500'>
          Works fully offline. No API keys, login, or external service are
          needed.
        </p>
      </div>
      <div className='flex flex-wrap gap-2'>
        <button
          onClick={createProject}
          disabled={busy}
          className='rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60'>
          {busy ? "Working…" : "Create local project"}
        </button>
        <button
          onClick={openProject}
          disabled={busy}
          className='rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60'>
          Open project
        </button>
        <label className='cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700'>
          Import CSV
          <input
            type='file'
            accept='.csv,.tsv'
            onChange={importCsv}
            className='hidden'
          />
        </label>
      </div>
      {project && (
        <div className='rounded-xl border border-slate-200 bg-slate-50 p-4'>
          <p className='text-xs font-bold uppercase tracking-[.16em] text-slate-400'>
            Project
          </p>
          <p className='mt-2 text-lg font-extrabold'>{project.name}</p>
          <div className='mt-3 grid gap-2 sm:grid-cols-3'>
            <div className='rounded-lg bg-white p-3'>
              <p className='text-[10px] font-bold uppercase tracking-[.16em] text-slate-400'>
                Tables
              </p>
              <p className='mt-1 text-xl font-extrabold text-slate-800'>
                {project.tables?.length || 0}
              </p>
            </div>
            <div className='rounded-lg bg-white p-3'>
              <p className='text-[10px] font-bold uppercase tracking-[.16em] text-slate-400'>
                Rows
              </p>
              <p className='mt-1 text-xl font-extrabold text-slate-800'>
                {project.tables?.reduce(
                  (sum, table) => sum + (table.rows?.length || 0),
                  0,
                ) || 0}
              </p>
            </div>
            <div className='rounded-lg bg-white p-3'>
              <p className='text-[10px] font-bold uppercase tracking-[.16em] text-slate-400'>
                Mode
              </p>
              <p className='mt-1 text-xl font-extrabold text-slate-800'>
                Local
              </p>
            </div>
          </div>
          <div className='mt-4 space-y-2'>
            {project.tables?.map((table) => (
              <div
                key={table.id}
                className='flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2'>
                <div>
                  <p className='font-bold text-slate-800'>{table.name}</p>
                  <p className='text-xs text-slate-500'>
                    {table.columns?.length || 0} columns ·{" "}
                    {table.rows?.length || 0} rows
                  </p>
                </div>
                <button
                  onClick={() =>
                    onAnalyzed?.({
                      name: table.name,
                      analysis: analyze(
                        table.columns || [],
                        (table.rows || []).map((row) =>
                          Object.fromEntries(
                            (table.columns || []).map((column) => [
                              column,
                              row?.[column] ?? "",
                            ]),
                          ),
                        ),
                      ),
                    })
                  }
                  className='rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700'>
                  Analyze
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {message && (
        <p className='rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700'>
          {message}
        </p>
      )}
    </div>
  );
}

function Connections({ onClose, onAnalyzed }) {
  const [selected, setSelected] = useState(null),
    [config, setConfig] = useState({}),
    [status, setStatus] = useState("");
  const provider = providers.find((p) => p.id === selected);
  const test = async () => {
    if (!selected) {
      setStatus("Choose a platform to test.");
      return;
    }
    setStatus("testing");
    try {
      const response = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: selected, config }),
      });
      const data = await readApiResponse(response);
      setStatus(data.error || data.message || "Connection validated.");
    } catch (error) {
      setStatus(error.message);
    }
  };
  return (
    <div className='fixed inset-0 z-20 grid place-items-center bg-slate-950/40 p-4'>
      <div className='max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-2xl'>
        <div className='flex items-center justify-between border-b p-5'>
          <div>
            <h2 className='text-lg font-extrabold'>Connect a data source</h2>
            <p className='mt-1 text-sm text-slate-500'>
              Credentials are used only for this request and are never saved by
              Clarity.
            </p>
          </div>
          <button
            onClick={onClose}
            className='rounded-lg p-2 hover:bg-slate-100'>
            <X size={20} />
          </button>
        </div>
        <div className='grid min-h-[420px] md:grid-cols-2'>
          <div className='border-r bg-slate-50 p-5'>
            <p className='mb-3 text-xs font-bold uppercase tracking-wider text-slate-400'>
              Platforms
            </p>
            <div className='grid gap-2'>
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelected(p.id);
                    setConfig({});
                    setStatus("");
                  }}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left ${selected === p.id ? "border-brand bg-white shadow-sm" : "border-transparent hover:bg-white"}`}>
                  <Database
                    size={17}
                    className={
                      selected === p.id ? "text-brand" : "text-slate-400"
                    }
                  />
                  <span>
                    <b className='block text-sm'>{p.name}</b>
                    <small className='text-xs text-slate-500'>{p.note}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className='p-6'>
            {provider ? (
              selected === "local" ? (
                <LocalStudio onAnalyzed={onAnalyzed} />
              ) : (
                <>
                  <h3 className='text-lg font-bold'>
                    {provider.name} connection
                  </h3>
                  <p className='mt-1 text-sm text-slate-500'>
                    Enter connection details to validate the configuration.
                  </p>
                  <div className='mt-5 space-y-4'>
                    {provider.fields.map(([id, label]) => (
                      <label
                        key={id}
                        className='block text-xs font-bold text-slate-600'>
                        {label}
                        <input
                          type={
                            /key|account|password/i.test(id)
                              ? "password"
                              : "text"
                          }
                          value={config[id] || ""}
                          onChange={(e) =>
                            setConfig({ ...config, [id]: e.target.value })
                          }
                          className='mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-indigo-100'
                          placeholder={`Enter ${label.toLowerCase()}`}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={test}
                    disabled={status === "testing"}
                    className='mt-6 flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60'>
                    {status === "testing" ? (
                      <Loader2 className='animate-spin' size={16} />
                    ) : (
                      <Link2 size={16} />
                    )}{" "}
                    Test connection
                  </button>
                  {selected === "mongodb" && (
                    <MongoActions config={config} onAnalyzed={onAnalyzed} />
                  )}{" "}
                  {status && status !== "testing" && (
                    <p
                      className={`mt-4 rounded-lg p-3 text-xs ${status.startsWith("Missing") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {status}
                    </p>
                  )}
                </>
              )
            ) : (
              <div className='grid h-full place-items-center text-center text-slate-400'>
                <div>
                  <Link2 className='mx-auto' />
                  <p className='mt-3 text-sm'>
                    Choose a platform to configure it.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function App() {
  const [analysis, setAnalysis] = useState(null),
    [filename, setFilename] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(false),
    [page, setPage] = useState("Overview"),
    [watchedFiles, setWatchedFiles] = useState([]),
    [watchedFolder, setWatchedFolder] = useState(""),
    [aiSummary, setAiSummary] = useState("");
  const file = useRef();
  const datasetMemoryRef = useRef(new Map());
  const autoLoadRef = useRef(false);
  const apiBase =
    window.__CLARITY_API_URL__ ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
    "http://localhost:8787";
  const requestJson = async (url, options = {}, timeoutMs = 15000) => {
    const candidates = [url];
    if (url.startsWith("/api/")) {
      candidates.push(`${apiBase}${url}`);
    }

    let lastError;
    for (const candidate of candidates) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(candidate, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(timer);
        const text = await response.text();
        if (!text) {
          if (!response.ok) {
            throw new Error(
              `The API returned an empty response (HTTP ${response.status}).`,
            );
          }
          return null;
        }
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error(
            `The API returned an invalid response (HTTP ${response.status}).`,
          );
        }
        if (!response.ok) {
          throw new Error(
            payload.error || `Request failed (HTTP ${response.status}).`,
          );
        }
        return payload;
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        if (candidate !== candidates[candidates.length - 1]) continue;
      }
    }
    throw lastError || new Error("The request failed.");
  };
  const applyAnalysis = (result, name) => {
    if (!result?.analysis) return;
    const datasetName = name || result.name || "Connected dataset";
    datasetMemoryRef.current.set(datasetName, result);
    setAnalysis(result.analysis);
    setFilename(datasetName);
    setAiSummary("");
    setPage("Overview");
  };
  useEffect(() => {
    const onAnalysisReady = (event) => {
      const payload =
        event.detail ||
        JSON.parse(
          window.sessionStorage.getItem("clarity-last-analysis") || "null",
        );
      if (payload) applyAnalysis(payload, payload.name || "Connected dataset");
    };
    window.addEventListener("clarity-analysis-ready", onAnalysisReady);
    return () =>
      window.removeEventListener("clarity-analysis-ready", onAnalysisReady);
  }, []);
  const parseFileLocally = async (file) => {
    const text = await file.text();
    const rows = parseCsvText(text, file.name);
    if (!rows.length)
      throw new Error(
        "The uploaded file does not contain a usable CSV dataset.",
      );
    return {
      name: file.name,
      analysis: analyze(Object.keys(rows[0]), rows),
    };
  };
  const run = async (form, name) => {
    setBusy(true);
    try {
      const endpoint =
        "/api/analyze/" + (form instanceof FormData ? "file" : "records");
      const options =
        form instanceof FormData
          ? { method: "POST", body: form }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(form),
            };
      const data = await requestJson(endpoint, options, 15000);
      if (!data) throw new Error("The API returned no data.");
      applyAnalysis(data, name);
    } catch (e) {
      if (form instanceof FormData && form.get("dataset") instanceof File) {
        try {
          const fallback = await parseFileLocally(form.get("dataset"));
          applyAnalysis(fallback, name);
          return;
        } catch (fallbackError) {
          e = fallbackError;
        }
      }

      const friendlyMessage =
        e?.name === "AbortError"
          ? "The API did not respond in time. Start the backend service or stop any stale Node processes using port 8787."
          : e?.message ||
            "The dataset could not be analyzed. Check that the API is running on port 8787.";
      alert(friendlyMessage);
    } finally {
      setBusy(false);
    }
  };
  const loadDemo = async () => {
    const datasetName = "customer_shopping_data.json";
    const cached = datasetMemoryRef.current.get(datasetName);
    if (cached) {
      applyAnalysis(cached, datasetName);
      return;
    }

    try {
      const data = await requestJson(
        "/api/local/watch/open?path=data/customer_shopping_data.json",
      );
      if (data?.analysis) {
        applyAnalysis(data, datasetName);
        return;
      }
    } catch {
      // Fallback to the bundled CSV if the JSON file is unavailable.
    }

    try {
      const csvData = await requestJson(
        "/api/local/watch/open?path=data/watched/customer_shopping_data.csv",
      );
      if (csvData?.analysis) {
        applyAnalysis(csvData, "customer_shopping_data.csv");
        return;
      }
    } catch {
      // Final fallback to the built-in sample.
    }

    run(samplePayload(), datasetName);
  };
  const summarizeWithGemini = async () => {
    if (!analysis) return;
    setBusy(true);
    try {
      const response = await requestJson("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: filename || "dataset.csv",
          analysis,
        }),
      });
      if (response?.text) {
        setAiSummary(response.text);
        alert(response.text);
      }
    } catch (error) {
      alert(error.message || "Gemini summary failed.");
    } finally {
      setBusy(false);
    }
  };
  const openWatchedFile = async (file) => {
    const fileName = typeof file === "string" ? file : file?.name;
    const filePath = typeof file === "string" ? file : file?.path;
    const datasetKey = fileName || filePath;
    const cached = datasetKey ? datasetMemoryRef.current.get(datasetKey) : null;

    if (cached) {
      applyAnalysis(cached, fileName || cached.name || "Watched dataset");
      return;
    }

    try {
      const target = filePath
        ? `/api/local/watch/open?path=${encodeURIComponent(filePath)}`
        : `/api/local/watch/open?name=${encodeURIComponent(fileName)}`;
      const data = await requestJson(target);
      if (data?.analysis) {
        applyAnalysis(data, fileName || data.name || "Watched dataset");
      }
    } catch (error) {
      alert(error.message || "The watched file could not be loaded.");
    }
  };
  const upload = (e) => {
    const f = e.target.files[0];
    if (f) {
      const fd = new FormData();
      fd.append("dataset", f);
      run(fd, f.name);
    }
  };
  useEffect(() => {
    const refreshWatchedFiles = async () => {
      try {
        const data = await requestJson("/api/local/watch");
        const files = data?.files || [];
        setWatchedFiles(files);
        setWatchedFolder(data?.folder || "");

        if (files.length && !filename && !busy && !autoLoadRef.current) {
          const preferred =
            files.find((file) =>
              /customer.*shopping.*\.csv$/i.test(file.name),
            ) ||
            files.find((file) => /shopping.*\.csv$/i.test(file.name)) ||
            files[0];
          autoLoadRef.current = true;
          openWatchedFile(preferred);
        }
      } catch {
        setWatchedFiles([]);
        setWatchedFolder("");
      }
    };
    refreshWatchedFiles();
    const timer = setInterval(refreshWatchedFiles, 2000);
    return () => clearInterval(timer);
  }, [filename, busy]);
  const nav = [
    ["Overview", LayoutDashboard],
    ["Data profile", BarChart3],
    ["Quality checks", ShieldCheck],
    ["Connections", Link2],
  ];
  return (
    <div className='min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)_320px]'>
      <aside className='hidden bg-[#111c30] p-5 text-slate-300 lg:flex lg:flex-col'>
        <div className='flex items-center gap-2 px-2 text-xl font-extrabold tracking-tight text-white'>
          <span className='grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm'>
            ✦
          </span>{" "}
          clarity
        </div>
        <p className='mt-8 px-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500'>
          Workspace
        </p>
        <div className='mt-3 rounded-xl border border-slate-700 bg-slate-800 p-3 text-sm font-bold text-white'>
          Data Studio <span className='float-right text-slate-400'>⌄</span>
        </div>
        <nav className='mt-7 space-y-1'>
          {nav.map(([n, I]) => (
            <button
              key={n}
              onClick={() =>
                n === "Connections" ? setModal(true) : setPage(n)
              }
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold ${page === n ? "bg-brand text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              <I size={17} />
              {n}
            </button>
          ))}
        </nav>
        <div className='mt-auto border-t border-slate-700 pt-5 text-xs leading-5 text-slate-400'>
          <b className='block text-slate-200'>Data stays yours.</b>Connect
          sources through your own server environment.
        </div>
      </aside>
      <main className='mx-auto w-full max-w-[1450px] p-5 md:p-8'>
        <header className='flex flex-wrap items-start justify-between gap-4'>
          <div>
            <p className='text-xs font-bold uppercase tracking-[.16em] text-brand'>
              Data observability
            </p>
            <h1 className='mt-1 text-2xl font-extrabold tracking-tight'>
              {page}
            </h1>
            <p className='mt-1 text-sm text-slate-500'>
              Find impurities, explain quality, and make data ready to use.
            </p>
          </div>
          <div className='flex gap-2'>
            <button
              onClick={() => setModal(true)}
              className='flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50'>
              <Link2 size={16} />
              Connect data
            </button>
            <button
              onClick={summarizeWithGemini}
              disabled={!analysis || busy}
              className='flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 disabled:cursor-not-allowed disabled:opacity-50'>
              <Sparkles size={16} />
              AI brief
            </button>
            <button
              onClick={() => file.current.click()}
              className='flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200'>
              <FileUp size={16} />
              Upload dataset
            </button>
            <input
              ref={file}
              onChange={upload}
              type='file'
              accept='.csv,.tsv'
              className='hidden'
            />
          </div>
        </header>
        <div className='mt-7'>
          {busy ? (
            <div className='grid min-h-[460px] place-items-center rounded-2xl bg-white'>
              <div className='text-center'>
                <Loader2 className='mx-auto animate-spin text-brand' />
                <p className='mt-3 text-sm font-bold'>Analyzing dataset…</p>
              </div>
            </div>
          ) : analysis ? (
            page === "Data profile" ? (
              <DataProfile analysis={analysis} filename={filename} />
            ) : (
              <Overview analysis={analysis} filename={filename} />
            )
          ) : (
            <div className='rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center'>
              <div className='mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-brand'>
                <Activity />
              </div>
              <h2 className='mt-5 text-xl font-extrabold'>
                Start with your data
              </h2>
              <p className='mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500'>
                Upload a CSV/TSV file or explore the dashboard with a
                representative demo dataset.
              </p>
              <div className='mt-6 flex justify-center gap-3'>
                <button
                  onClick={() => file.current.click()}
                  className='rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white'>
                  Upload CSV
                </button>
                <button
                  onClick={loadDemo}
                  className='flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold'>
                  <RefreshCw size={15} />
                  Load customer data
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
      <aside className='hidden border-l border-slate-200 bg-slate-50 p-4 lg:block'>
        <div className='sticky top-4'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-sm font-extrabold uppercase tracking-[.16em] text-slate-500'>
              Files
            </h2>
            <span className='rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-brand'>
              {watchedFiles.length}
            </span>
          </div>
          <div className='rounded-2xl border border-slate-200 bg-white p-3'>
            <p className='text-[10px] font-bold uppercase tracking-[.16em] text-slate-400'>
              Watch folder
            </p>
            <p className='mt-2 break-all text-xs font-semibold text-slate-700'>
              {watchedFolder || "data/watched"}
            </p>
          </div>
          <div className='mt-4 space-y-2'>
            {watchedFiles.length ? (
              watchedFiles.map((file) => (
                <button
                  key={file.path || file.name}
                  onClick={() => openWatchedFile(file)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${filename === file.name ? "border-brand bg-brand/5 text-brand" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}>
                  <span className='min-w-0'>
                    <span className='block truncate text-sm font-bold'>
                      {file.name}
                    </span>
                    <span className='text-[10px] text-slate-500'>
                      {Math.round(file.size / 1024)} KB
                    </span>
                  </span>
                  <span className='text-[10px] font-bold uppercase tracking-[.12em] text-slate-400'>
                    CSV
                  </span>
                </button>
              ))
            ) : (
              <div className='rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500'>
                No CSV/TSV files detected yet.
              </div>
            )}
          </div>
        </div>
      </aside>
      {modal && (
        <Connections
          onClose={() => setModal(false)}
          onAnalyzed={(result) =>
            applyAnalysis(result, result.name || "Connected dataset")
          }
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
