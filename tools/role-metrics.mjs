#!/usr/bin/env bun
// Computes the run metrics from docs/evaluation.md for each role, over whole days in a named time zone.
// Every metric is shown beside its value in the window of equal length just before, and beside its target.
// It runs under Bun or Node 22 and needs no packages. The input format is in docs/evaluation.md.
//
//   bun tools/role-metrics.mjs runs.jsonl --from 2026-11-01 --to 2026-11-03 --zone America/Los_Angeles
//   node tools/role-metrics.mjs runs.jsonl --from 2026-11-01 --to 2026-11-03 --zone UTC --json
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const triggers = ["schedule", "agent", "person", "event"];
const targets = { rescues: 0, agentToSchedule: 0.5, readingBytes: 40 * 1024, drift: 0 };
const dayMs = 24 * 60 * 60 * 1000;
const usage = "Usage: role-metrics.mjs <runs.jsonl> --from YYYY-MM-DD --to YYYY-MM-DD --zone <IANA zone> [--json]";

const isText = (value) => typeof value === "string" && value.length > 0;
const isTime = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isCount = (value) => Number.isInteger(value) && value >= 0;
const optional = (check) => (value) => value === undefined || check(value);
const fields = {
  role: isText,
  trigger: (value) => triggers.includes(value),
  startedAt: isTime,
  dueAt: optional(isTime),
  model: optional(isText),
  configuredModel: optional(isText),
  readingBytes: optional(isCount),
  reportChars: optional(isCount),
  rescued: optional((value) => typeof value === "boolean"),
};

function parseLine(line, where) {
  try {
    return JSON.parse(line);
  } catch {
    throw new Error(`${where}: not valid JSON`);
  }
}

/** Parses JSON Lines into runs. A bad line fails with its line number and field name, so no run is dropped silently. */
export function parseRuns(text, source = "input") {
  return text.split("\n").flatMap((line, index) => {
    if (!line.trim()) return [];
    const where = `${source}:${index + 1}`;
    const run = parseLine(line, where);
    const invalid = Object.keys(fields).find((name) => !fields[name](run?.[name]));
    if (invalid) throw new Error(`${where}: missing or invalid "${invalid}"`);
    return [run];
  });
}

function checkZone(zone) {
  // A fixed offset such as +08:00 is wrong for half the year wherever daylight saving applies.
  if (zone !== "UTC" && !/^[A-Za-z]+(?:\/[\w+-]+)+$/u.test(zone))
    throw new Error(`--zone must be an IANA zone such as America/Los_Angeles`);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    throw new Error(`--zone ${zone} is not a known time zone`);
  }
}

function checkDate(date, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date ?? "") || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
    throw new Error(`--${name} must be a calendar date such as 2026-11-01`);
}

const shiftDate = (date, days) => new Date(Date.parse(date) + days * dayMs).toISOString().slice(0, 10);

function zoneOffset(instant, zone) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const part = Object.fromEntries(format.formatToParts(instant).map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second) - instant;
}

/** Epoch milliseconds at which `date` begins in `zone`; the second pass corrects for an offset change near midnight. */
function startOfDay(date, zone) {
  const midnight = Date.parse(date);
  return midnight - zoneOffset(midnight - zoneOffset(midnight, zone), zone);
}

/** The requested window and the window of equal length just before it, as half-open epoch-millisecond ranges. */
export function windows(from, to, zone) {
  checkZone(zone);
  checkDate(from, "from");
  checkDate(to, "to");
  const days = (Date.parse(to) - Date.parse(from)) / dayMs + 1;
  if (days < 1) throw new Error("--to must not be before --from");
  const span = (first, last) => ({ from: first, to: last, start: startOfDay(first, zone), end: startOfDay(shiftDate(last, 1), zone) });
  return { current: span(from, to), previous: span(shiftDate(from, -days), shiftDate(from, -1)) };
}

/** Nearest-rank percentile: the smallest value with at least `p` percent of values at or below it. */
export function percentile(values, p) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

const distribution = (values) => ({
  runs: values.length,
  p50: percentile(values, 50),
  p90: percentile(values, 90),
  max: percentile(values, 100),
});
const present = (runs, field) => runs.flatMap((run) => (run[field] === undefined ? [] : [run[field]]));

function summarize(runs) {
  const reading = present(runs, "readingBytes");
  const modelled = runs.filter((run) => run.model !== undefined && run.configuredModel !== undefined);
  const timed = runs.filter((run) => run.dueAt !== undefined);
  return {
    runs: runs.length,
    rescues: runs.filter((run) => run.rescued === true).length,
    triggers: Object.fromEntries(triggers.map((trigger) => [trigger, runs.filter((run) => run.trigger === trigger).length])),
    reading: { ...distribution(reading), over: reading.filter((bytes) => bytes > targets.readingBytes).length },
    drift: { runs: modelled.length, count: modelled.filter((run) => run.model !== run.configuredModel).length },
    queueWaitMinutes: distribution(timed.map((run) => (Date.parse(run.startedAt) - Date.parse(run.dueAt)) / 60000)),
    reportChars: distribution(present(runs, "reportChars")),
  };
}

/** Groups runs by role and summarizes each role in the requested window and the one before it. */
export function computeReport(runs, { from, to, zone }) {
  const { current, previous } = windows(from, to, zone);
  const inside = (span) => (run) => Date.parse(run.startedAt) >= span.start && Date.parse(run.startedAt) < span.end;
  const counted = runs.filter((run) => inside(current)(run) || inside(previous)(run));
  const roles = [...new Set(counted.map((run) => run.role))].sort();
  const forRole = (role, span) => summarize(counted.filter((run) => run.role === role && inside(span)(run)));
  return {
    zone,
    current: { from: current.from, to: current.to },
    previous: { from: previous.from, to: previous.to },
    roles: roles.map((role) => ({ role, current: forRole(role, current), previous: forRole(role, previous) })),
  };
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const minutes = (value) => `${Math.round(value * 10) / 10} min`;
const ratio = ({ agent, schedule }) => (schedule ? agent / schedule : agent ? Infinity : undefined);

function ratioText(summary) {
  const value = ratio(summary.triggers);
  const shown = value === undefined ? "n/a" : value === Infinity ? "∞" : value.toFixed(2);
  return `${summary.triggers.agent} / ${summary.triggers.schedule} = ${shown}`;
}

const judged = (hasData, passed) => (hasData ? passed : undefined);
const rows = [
  ["Runs", (s) => String(s.runs), "—", () => undefined],
  ["Human rescues", (s) => `${s.rescues} of ${s.runs} runs`, "0", (s) => judged(s.runs > 0, s.rescues <= targets.rescues)],
  ["Trigger mix", (s) => triggers.map((trigger) => `${trigger} ${s.triggers[trigger]}`).join(", "), "reported", () => undefined],
  [
    "Agent-to-schedule ratio",
    ratioText,
    `≤ ${targets.agentToSchedule}`,
    (s) => judged(ratio(s.triggers) !== undefined, ratio(s.triggers) <= targets.agentToSchedule),
  ],
  [
    "Reading load",
    (s) =>
      s.reading.runs ? `${s.reading.over} of ${s.reading.runs} runs over; p50 ${kb(s.reading.p50)}, max ${kb(s.reading.max)}` : "no data",
    `≤ ${kb(targets.readingBytes)} per run`,
    (s) => judged(s.reading.runs > 0, s.reading.over === 0),
  ],
  [
    "Model drift",
    (s) => (s.drift.runs ? `${s.drift.count} of ${s.drift.runs} runs` : "no data"),
    "0",
    (s) => judged(s.drift.runs > 0, s.drift.count <= targets.drift),
  ],
  [
    "Queue wait",
    (s) => {
      const wait = s.queueWaitMinutes;
      return wait.runs ? `p50 ${minutes(wait.p50)}, p90 ${minutes(wait.p90)}, max ${minutes(wait.max)} (${wait.runs} runs)` : "no data";
    },
    "p90 under the schedule interval",
    () => undefined,
  ],
  [
    "Report size",
    (s) => (s.reportChars.runs ? `p50 ${s.reportChars.p50}, max ${s.reportChars.max} characters` : "no data"),
    "readable in a minute",
    () => undefined,
  ],
];

const verdict = (met) => (met === undefined ? "" : met ? "yes" : "**no**");

/** Renders the report as Markdown: one table per role, with the verdict taken from the requested window. */
export function renderMarkdown(report) {
  const lines = [
    `# Role metrics, ${report.current.from} to ${report.current.to} (${report.zone})`,
    "",
    `Previous window: ${report.previous.from} to ${report.previous.to}. Percentiles are nearest-rank.`,
  ];
  if (!report.roles.length) lines.push("", "No runs in either window.");
  for (const { role, current, previous } of report.roles) {
    lines.push("", `## ${role}`, "", "| Metric | This window | Previous | Target | Met |", "| --- | --- | --- | --- | --- |");
    for (const [label, value, target, met] of rows)
      lines.push(`| ${label} | ${value(current)} | ${value(previous)} | ${target} | ${verdict(met(current))} |`);
  }
  return lines.join("\n");
}

/** Runs the command line and returns what it prints. */
export function run(argv) {
  const options = { from: { type: "string" }, to: { type: "string" }, zone: { type: "string" }, json: { type: "boolean" } };
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options });
  if (positionals.length !== 1 || !values.from || !values.to || !values.zone) throw new Error(usage);
  const report = computeReport(parseRuns(readFileSync(positionals[0], "utf8"), positionals[0]), values);
  return values.json ? JSON.stringify(report, null, 2) : renderMarkdown(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(run(process.argv.slice(2)));
  } catch (error) {
    console.error(`role-metrics: ${error.message}`);
    process.exitCode = 1;
  }
}
