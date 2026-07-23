import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataSource = await readFile(new URL("../app/data.ts", import.meta.url), "utf8");
const hubSource = await readFile(new URL("../app/JobHub.tsx", import.meta.url), "utf8");

function numbersFrom(source) {
  return [...source.matchAll(/\b\d+\b/g)].map((match) => Number(match[0]));
}

test("the plan includes every canonical Blind 75 problem", () => {
  const canonicalBlock = dataSource.match(/const blind75ProblemIds = new Set\(\[([\s\S]*?)\]\);/);
  const rawPlanBlock = dataSource.match(/const rawProblems = \[([\s\S]*?)\] as const/);
  assert.ok(canonicalBlock, "Blind 75 ID set is present");
  assert.ok(rawPlanBlock, "raw interview plan is present");

  const canonicalIds = new Set(numbersFrom(canonicalBlock[1]));
  const planIds = new Set([...rawPlanBlock[1].matchAll(/^\s*\[(\d+),/gm)].map((match) => Number(match[1])));
  assert.equal(canonicalIds.size, 75);
  assert.equal([...canonicalIds].filter((id) => !planIds.has(id)).length, 0);
  assert.equal(planIds.size, 113);
});

test("hint independence and final submission remain separate scores", () => {
  assert.match(hubSource, /const HINT_PENALTY = 10/);
  assert.match(hubSource, />Final submission</);
  assert.match(hubSource, />Independence</);
  assert.match(hubSource, /hintsUsed: string\[\]/);
});

test("application sync covers interval, visibility, focus, and reconnect", () => {
  assert.match(hubSource, /SHEET_SYNC_INTERVAL_MS = 30_000/);
  assert.match(hubSource, /addEventListener\("focus"/);
  assert.match(hubSource, /addEventListener\("online"/);
  assert.match(hubSource, /addEventListener\("visibilitychange"/);
});
