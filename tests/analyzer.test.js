import test from "node:test";
import assert from "node:assert/strict";
import { analyze, parseCsvText } from "../src/lib/data-analysis.js";

test("analyze exposes strong pivot-table relationships in the data profile", () => {
  const headers = ["city", "segment", "channel", "status"];
  const rows = [
    { city: "Mumbai", segment: "Premium", channel: "Email", status: "Active" },
    { city: "Mumbai", segment: "Premium", channel: "Email", status: "Active" },
    {
      city: "Mumbai",
      segment: "Premium",
      channel: "Email",
      status: "Inactive",
    },
    {
      city: "Mumbai",
      segment: "Standard",
      channel: "Organic",
      status: "Active",
    },
    {
      city: "Delhi",
      segment: "Standard",
      channel: "Organic",
      status: "Active",
    },
    {
      city: "Delhi",
      segment: "Standard",
      channel: "Organic",
      status: "Inactive",
    },
    {
      city: "Bengaluru",
      segment: "Premium",
      channel: "Email",
      status: "Active",
    },
    {
      city: "Bengaluru",
      segment: "Premium",
      channel: "Email",
      status: "Active",
    },
    {
      city: "Bengaluru",
      segment: "New",
      channel: "Referral",
      status: "Active",
    },
    {
      city: "Chennai",
      segment: "New",
      channel: "Referral",
      status: "Inactive",
    },
  ];

  const result = analyze(headers, rows);

  assert.ok(Array.isArray(result.pivotRelationships));
  assert.ok(
    result.pivotRelationships.length >= 1,
    "expected at least one pivot relationship",
  );
  assert.ok(
    result.pivotRelationships[0].score > 0,
    "relationship score should be positive",
  );
  assert.ok(
    result.pivotRelationships[0].matrix.length > 0,
    "relationship should include pivot matrix data",
  );
  assert.ok(
    result.pivotRelationships[0].left && result.pivotRelationships[0].right,
  );
});

test("parseCsvText handles BOMs and semicolon-delimited files", () => {
  const csv =
    '\uFEFFname;city;score\r\n"Ada";"Paris";10\r\n"Bob";"Berlin";20\r\n';

  const rows = parseCsvText(csv);

  assert.deepEqual(rows, [
    { name: "Ada", city: "Paris", score: "10" },
    { name: "Bob", city: "Berlin", score: "20" },
  ]);
});
