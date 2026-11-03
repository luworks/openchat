// Run with `node --test test/` from the repository root.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { computeReport, parseRuns, percentile, renderMarkdown, run, windows } from "../tools/role-metrics.mjs";

// 2026-11-01 is the day daylight saving time ends in America/Los_Angeles: it starts at 07:00Z, and 2026-11-03 at 08:00Z.
const window = { from: "2026-11-01", to: "2026-11-02", zone: "America/Los_Angeles" };
const runs = [
  {
    role: "merge-steward",
    trigger: "schedule",
    startedAt: "2026-11-01T07:00:00Z",
    dueAt: "2026-11-01T06:58:00Z",
    model: "m/high",
    configuredModel: "m/high",
    readingBytes: 20 * 1024,
    reportChars: 400,
  },
  {
    role: "merge-steward",
    trigger: "schedule",
    startedAt: "2026-11-02T12:00:00Z",
    dueAt: "2026-11-02T11:50:00Z",
    model: "m/low",
    configuredModel: "m/high",
    readingBytes: 44 * 1024,
    reportChars: 900,
    rescued: true,
  },
  { role: "merge-steward", trigger: "agent", startedAt: "2026-11-03T07:59:59Z", readingBytes: 30 * 1024, reportChars: 600 },
  { role: "merge-steward", trigger: "agent", startedAt: "2026-11-03T08:00:00Z" },
  { role: "merge-steward", trigger: "person", startedAt: "2026-11-01T06:59:59Z", rescued: true },
  { role: "merge-steward", trigger: "schedule", startedAt: "2026-10-30T07:00:00Z" },
  { role: "merge-steward", trigger: "schedule", startedAt: "2026-10-30T06:59:59Z" },
  { role: "triager", trigger: "event", startedAt: "2026-10-31T12:00:00Z" },
];

test("windows are whole days in the named zone, across a daylight saving change", () => {
  const { current, previous } = windows(window.from, window.to, window.zone);
  assert.equal(current.start, Date.parse("2026-11-01T07:00:00Z"));
  assert.equal(current.end, Date.parse("2026-11-03T08:00:00Z"));
  assert.deepEqual([previous.from, previous.to], ["2026-10-30", "2026-10-31"]);
  assert.equal(previous.start, Date.parse("2026-10-30T07:00:00Z"));
  assert.equal(previous.end, current.start);
});

test("each role is summarized for the window and the one before it", () => {
  const report = computeReport(runs, window);
  assert.deepEqual(
    report.roles.map(({ role }) => role),
    ["merge-steward", "triager"],
  );
  const [steward, triager] = report.roles;
  assert.deepEqual(steward.current, {
    runs: 3,
    rescues: 1,
    triggers: { schedule: 2, agent: 1, person: 0, event: 0 },
    reading: { runs: 3, p50: 30 * 1024, p90: 44 * 1024, max: 44 * 1024, over: 1 },
    drift: { runs: 2, count: 1 },
    queueWaitMinutes: { runs: 2, p50: 2, p90: 10, max: 10 },
    reportChars: { runs: 3, p50: 600, p90: 900, max: 900 },
  });
  assert.equal(steward.previous.runs, 2);
  assert.equal(steward.previous.rescues, 1);
  assert.deepEqual(steward.previous.triggers, { schedule: 1, agent: 0, person: 1, event: 0 });
  assert.equal(triager.current.runs, 0);
  assert.equal(triager.previous.runs, 1);
});

test("the Markdown report puts each value beside the previous window and the target", () => {
  const lines = renderMarkdown(computeReport(runs, window)).split("\n");
  for (const expected of [
    "# Role metrics, 2026-11-01 to 2026-11-02 (America/Los_Angeles)",
    "| Human rescues | 1 of 3 runs | 1 of 2 runs | 0 | **no** |",
    "| Agent-to-schedule ratio | 1 / 2 = 0.50 | 0 / 1 = 0.00 | ≤ 0.5 | yes |",
    "| Reading load | 1 of 3 runs over; p50 30 KB, max 44 KB | no data | ≤ 40 KB per run | **no** |",
    "| Model drift | 1 of 2 runs | no data | 0 | **no** |",
    "| Queue wait | p50 2 min, p90 10 min, max 10 min (2 runs) | no data | p90 under the schedule interval |  |",
    "| Human rescues | 0 of 0 runs | 0 of 1 runs | 0 |  |",
    "| Agent-to-schedule ratio | 0 / 0 = n/a | 0 / 0 = n/a | ≤ 0.5 |  |",
  ])
    assert.ok(lines.includes(expected), expected);
  assert.match(renderMarkdown(computeReport([], window)), /No runs in either window\./u);
});

test("percentiles use the nearest rank", () => {
  assert.equal(percentile([], 50), undefined);
  assert.equal(percentile([5], 90), 5);
  assert.equal(percentile([4, 1, 3, 2], 50), 2);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
});

test("bad input fails with a location instead of being skipped", () => {
  const line = JSON.stringify({ role: "triager", trigger: "event", startedAt: "2026-11-01T12:00:00Z" });
  assert.equal(parseRuns(`${line}\n\n${line}\n`, "runs.jsonl").length, 2);
  assert.throws(() => parseRuns(`${line}\n{oops`, "runs.jsonl"), /^Error: runs\.jsonl:2: not valid JSON$/u);
  assert.throws(() => parseRuns(JSON.stringify({ role: "triager", trigger: "cron", startedAt: "2026-11-01T12:00:00Z" })), /"trigger"/u);
  assert.throws(() => parseRuns(JSON.stringify({ role: "triager", trigger: "event", startedAt: "soon" })), /"startedAt"/u);
  assert.throws(
    () => parseRuns(JSON.stringify({ role: "triager", trigger: "event", startedAt: "2026-11-01T12:00:00Z", readingBytes: -1 })),
    /"readingBytes"/u,
  );
  assert.throws(() => parseRuns("[]"), /"role"/u);
  assert.throws(() => windows("2026-11-01", "2026-11-02", "+08:00"), /IANA zone/u);
  assert.throws(() => windows("2026-11-01", "2026-11-02", "Nowhere/Atlantis"), /not a known time zone/u);
  assert.throws(() => windows("2026-02-30", "2026-03-01", "UTC"), /--from must be a calendar date/u);
  assert.throws(() => windows("2026-11-02", "2026-11-01", "UTC"), /must not be before/u);
});

test("the command line reads a file and prints Markdown or JSON", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "role-metrics-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "runs.jsonl");
  writeFileSync(file, runs.map((entry) => JSON.stringify(entry)).join("\n"));
  const args = [file, "--from", window.from, "--to", window.to, "--zone", window.zone];
  assert.match(run(args), /^# Role metrics, 2026-11-01 to 2026-11-02/u);
  assert.equal(JSON.parse(run([...args, "--json"])).roles[0].current.runs, 3);
  assert.throws(() => run([file, "--from", window.from, "--to", window.to]), /^Error: Usage:/u);
});
