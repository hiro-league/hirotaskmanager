#!/usr/bin/env node
/**
 * Summarizes Chrome DevTools Performance JSON traces (traceEvents format) for
 * board-performance analysis without loading the full file into memory.
 *
 * Expects the usual DevTools export shape: top-level object with a "traceEvents"
 * array. Events are read line-by-line (one JSON object per line after the opening
 * `[`), which matches default Performance saves; minified single-line traces are
 * not supported — re-export from DevTools or pretty-print first.
 *
 * Usage:
 *   node docs/chrome-profiling/summarize-chrome-trace.mjs [file.json ...]
 *   node docs/chrome-profiling/summarize-chrome-trace.mjs   # all chrome-trace-*.json here
 *   npm run profile:chrome -- docs/chrome-profiling/chrome-trace-dnd.json
 *
 * Options:
 *   --quiet              no progress on stderr
 *   --long-ms <n>        long-task threshold in ms (wall time, default 50)
 *   --frame-ms <n>       flag RunTask slices >= n ms (default 16)
 *   --min-agg-us <n>     ignore shorter events when aggregating by name (default 500)
 *   --top <n>            rows for ranked tables (default 40)
 *   --thread <pid:tid>   force main thread key instead of CrRendererMain heuristic
 *   --show-inspector-cats include v8.inspector in the category table (very noisy when DevTools is open)
 *
 * Two passes over the file: (1) map thread/process names and total wall duration
 * per thread to pick the renderer main thread; (2) aggregate hotspots on that thread.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} line */
function parseTraceEventLine(line) {
  const t = line.trim();
  if (!t || t === ",") return null;
  if (t.startsWith("]")) return null;
  let s = t.replace(/,$/, "");
  if (!s.startsWith("{")) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * @param {string} filePath
 * @param {(ev: object) => void} onEvent
 */
async function streamTraceEvents(filePath, onEvent) {
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let inTraceArray = false;

  for await (const line of rl) {
    if (!inTraceArray) {
      if (line.includes('"traceEvents"')) {
        inTraceArray = true;
      }
      continue;
    }

    const ev = parseTraceEventLine(line);
    if (ev) onEvent(ev);
    else if (line.trim().startsWith("]")) break;
  }
}

function threadKey(pid, tid) {
  return `${pid}:${tid}`;
}

/** @type {(ev: object) => string | null} */
function metadataThreadName(ev) {
  if (ev.ph !== "M") return null;
  if (ev.name !== "thread_name" && ev.name !== "process_name") return null;
  const n = ev.args?.name;
  return typeof n === "string" ? n : null;
}

function isNoiseForNameAgg(ev, minAggUs) {
  const cat = String(ev.cat ?? "");
  const name = String(ev.name ?? "");
  if (name.startsWith("v8::Debugger::")) return true;
  if (cat.includes("v8.inspector")) return true;
  const dur = Number(ev.dur) || 0;
  if (dur < minAggUs) return true;
  return false;
}

/** Inspector async tasks flood traces while DevTools is attached; drop from long-task / frame lists only. */
function isInspectorNoiseEvent(ev) {
  return String(ev.cat ?? "").includes("v8.inspector");
}

function isGcName(name) {
  return (
    name.includes("MajorGC") ||
    name.includes("MinorGC") ||
    name.includes("V8.GC") ||
    name.includes("BlinkGC") ||
    name === "GCEvent"
  );
}

function isLayoutishName(name) {
  const n = name.toLowerCase();
  return (
    n.includes("layout") ||
    n.includes("recalculate style") ||
    n.includes("update layer tree") ||
    n.includes("intersection") ||
    n.includes("paint") ||
    n.includes("composite") ||
    n.includes("pre-paint")
  );
}

function shortenArgs(args, maxLen) {
  if (args == null) return "";
  try {
    const s = JSON.stringify(args);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}…`;
  } catch {
    return "";
  }
}

/**
 * Pass 1: thread names + wall-time totals per thread (complete events only).
 * @param {string} filePath
 */
async function passDiscoverThreads(filePath) {
  /** @type {Map<string, string>} */
  const threadNames = new Map();
  /** @type {Map<number, string>} */
  const processNames = new Map();
  /** @type {Map<string, number>} */
  const wallDurByKey = new Map();

  await streamTraceEvents(filePath, (ev) => {
    const pid = ev.pid;
    const tid = ev.tid;
    if (typeof pid !== "number" || typeof tid !== "number") return;

    const mn = metadataThreadName(ev);
    if (mn != null) {
      if (ev.name === "process_name" && tid === 0) {
        processNames.set(pid, mn);
      } else if (ev.name === "thread_name") {
        threadNames.set(threadKey(pid, tid), mn);
      }
      return;
    }

    if (ev.ph !== "X") return;
    const dur = Number(ev.dur);
    if (!Number.isFinite(dur) || dur <= 0) return;

    const key = threadKey(pid, tid);
    wallDurByKey.set(key, (wallDurByKey.get(key) ?? 0) + dur);
  });

  return { threadNames, processNames, wallDurByKey };
}

/**
 * @param {Map<string, string>} threadNames
 * @param {Map<number, string>} processNames
 * @param {Map<string, number>} wallDurByKey
 * @param {string | null} forcedKey
 */
function pickRendererMainKey(threadNames, processNames, wallDurByKey, forcedKey) {
  if (forcedKey && wallDurByKey.has(forcedKey)) {
    return { key: forcedKey, reason: "forced --thread" };
  }
  if (forcedKey) {
    return { key: null, reason: `forced thread ${forcedKey} not found in trace` };
  }

  let bestKey = null;
  let bestDur = 0;
  for (const [key, name] of threadNames) {
    if (name !== "CrRendererMain") continue;
    const d = wallDurByKey.get(key) ?? 0;
    if (d > bestDur) {
      bestDur = d;
      bestKey = key;
    }
  }
  if (bestKey) {
    return { key: bestKey, reason: "CrRendererMain (largest wall-time among labeled threads)" };
  }

  bestDur = 0;
  bestKey = null;
  for (const [key, d] of wallDurByKey) {
    const pid = Number(key.split(":")[0]);
    if (processNames.get(pid) !== "Renderer") continue;
    if (d > bestDur) {
      bestDur = d;
      bestKey = key;
    }
  }
  if (bestKey) {
    const label = threadNames.get(bestKey) ?? "?";
    return { key: bestKey, reason: `Renderer process, busiest thread by wall-time (thread_name=${label})` };
  }

  for (const [key, d] of wallDurByKey) {
    if (d > bestDur) {
      bestDur = d;
      bestKey = key;
    }
  }
  return { key: bestKey, reason: "fallback: busiest thread overall (no CrRendererMain / Renderer match)" };
}

/**
 * @param {string} filePath
 * @param {object} opts
 */
async function passAggregateMain(filePath, mainKey, opts) {
  const longUs = Math.round(opts.longMs * 1000);
  const frameUs = Math.round(opts.frameMs * 1000);
  const minAggUs = opts.minAggUs;
  const topN = opts.top;

  let completeCount = 0;
  let sumWallUs = 0;
  let sumTdurUs = 0;
  let tdurSamples = 0;

  /** @type {Map<string, { count: number, sumDur: number, maxDur: number }>} */
  const byName = new Map();
  /** @type {Map<string, { count: number, sumDur: number }>} */
  const byCat = new Map();

  /** @type {{ dur: number, name: string, cat: string, argsHint: string }[]} */
  const longTasks = [];
  /** @type {{ dur: number, name: string, cat: string, argsHint: string }[]} */
  const frameTasks = [];

  let gcWallUs = 0;
  let gcCount = 0;
  let layoutWallUs = 0;
  let layoutCount = 0;

  await streamTraceEvents(filePath, (ev) => {
    if (ev.ph !== "X") return;
    const pid = ev.pid;
    const tid = ev.tid;
    if (threadKey(pid, tid) !== mainKey) return;

    const dur = Number(ev.dur);
    if (!Number.isFinite(dur) || dur <= 0) return;

    completeCount += 1;
    sumWallUs += dur;

    const tdur = Number(ev.tdur);
    if (Number.isFinite(tdur) && tdur > 0) {
      sumTdurUs += tdur;
      tdurSamples += 1;
    }

    const name = String(ev.name ?? "(no name)");
    const cat = String(ev.cat ?? "");

    let catAgg = byCat.get(cat);
    if (!catAgg) {
      catAgg = { count: 0, sumDur: 0 };
      byCat.set(cat, catAgg);
    }
    catAgg.count += 1;
    catAgg.sumDur += dur;

    if (!isNoiseForNameAgg(ev, minAggUs)) {
      let agg = byName.get(name);
      if (!agg) {
        agg = { count: 0, sumDur: 0, maxDur: 0 };
        byName.set(name, agg);
      }
      agg.count += 1;
      agg.sumDur += dur;
      agg.maxDur = Math.max(agg.maxDur, dur);
    }

    if (isGcName(name)) {
      gcWallUs += dur;
      gcCount += 1;
    }
    if (isLayoutishName(name)) {
      layoutWallUs += dur;
      layoutCount += 1;
    }

    const hint = shortenArgs(ev.args, 140);

    if (dur >= longUs && !isInspectorNoiseEvent(ev)) {
      longTasks.push({ dur, name, cat, argsHint: hint });
    }
    if (name === "RunTask" && dur >= frameUs && !isInspectorNoiseEvent(ev)) {
      frameTasks.push({ dur, name, cat, argsHint: hint });
    }
  });

  longTasks.sort((a, b) => b.dur - a.dur);
  frameTasks.sort((a, b) => b.dur - a.dur);

  const rankedNames = [...byName.entries()]
    .map(([n, v]) => ({ name: n, ...v }))
    .sort((a, b) => b.sumDur - a.sumDur);

  const rankedCats = [...byCat.entries()]
    .map(([c, v]) => ({ cat: c, ...v }))
    .sort((a, b) => b.sumDur - a.sumDur);

  return {
    completeCount,
    sumWallUs,
    sumTdurUs,
    tdurSamples,
    byName: rankedNames,
    byCat: rankedCats,
    longTasks: longTasks.slice(0, topN),
    frameTasks: frameTasks.slice(0, topN),
    gcWallUs,
    gcCount,
    layoutWallUs,
    layoutCount,
    topN,
  };
}

function readMetadataStartTime(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const head = buf.subarray(0, n).toString("utf8");
    const m = head.match(/"startTime"\s*:\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} filePath
 * @param {object} opts
 */
async function summarizeFile(filePath, opts) {
  const base = path.basename(filePath);
  const startTime = readMetadataStartTime(filePath);

  const { threadNames, processNames, wallDurByKey } = await passDiscoverThreads(filePath);
  const picked = pickRendererMainKey(threadNames, processNames, wallDurByKey, opts.threadKey);

  const lines = [];
  lines.push(`=== ${base} ===`);
  if (startTime) lines.push(`trace startTime (metadata): ${startTime}`);
  lines.push(
    `main thread: ${picked.key ?? "(none)"} — ${picked.reason}`
  );
  lines.push(
    "note: sums by name/category use inclusive wall time (dur, μs); nested Chrome events overlap, so totals are not exclusive."
  );
  lines.push(
    "note: tdur (thread duration) sums only where DevTools emitted tdur on complete events — useful as a CPU-ish hint, not identical to Bottom-Up self time."
  );
  lines.push(
    "note: long-task / RunTask lists skip v8.inspector events (DevTools debugger noise while recording)."
  );
  lines.push("");

  if (!picked.key) {
    lines.push("Could not pick a main thread; pass --thread pid:tid from DevTools metadata.");
    return lines.join("\n");
  }

  const agg = await passAggregateMain(filePath, picked.key, opts);
  const wallMs = agg.sumWallUs / 1000;
  const tdurMs = agg.sumTdurUs / 1000;

  lines.push(`complete events (ph=X) on main thread: ${agg.completeCount}`);
  lines.push(`sum of dur (wall, ms): ${wallMs.toFixed(1)}`);
  if (agg.tdurSamples > 0) {
    lines.push(
      `sum of tdur where present (ms): ${tdurMs.toFixed(1)} (${agg.tdurSamples} events had tdur)`
    );
  }
  lines.push(
    `GC-related events (name heuristic): ${agg.gcCount} slices, ${(agg.gcWallUs / 1000).toFixed(1)} ms wall (inclusive)`
  );
  lines.push(
    `layout/paint-ish events (name heuristic): ${agg.layoutCount} slices, ${(agg.layoutWallUs / 1000).toFixed(1)} ms wall (inclusive)`
  );
  lines.push("");
  lines.push(`-- Long tasks (dur >= ${opts.longMs} ms), top ${agg.topN} by duration --`);
  for (const row of agg.longTasks) {
    lines.push(
      `  ${(row.dur / 1000).toFixed(1).padStart(8)} ms  ${row.name}  [${row.cat}]${row.argsHint ? `  ${row.argsHint}` : ""}`
    );
  }
  if (agg.longTasks.length === 0) {
    lines.push("  (none)");
  }
  lines.push("");
  lines.push(`-- RunTask slices >= ${opts.frameMs} ms (frame budget hints), top ${agg.topN} --`);
  for (const row of agg.frameTasks) {
    lines.push(`  ${(row.dur / 1000).toFixed(1).padStart(8)} ms  [${row.cat}]${row.argsHint ? `  ${row.argsHint}` : ""}`);
  }
  if (agg.frameTasks.length === 0) {
    lines.push("  (none)");
  }
  lines.push("");
  lines.push(`-- Top ${agg.topN} event names on main thread (min dur ${opts.minAggUs} μs, noise filters) --`);
  for (const row of agg.byName.slice(0, agg.topN)) {
    lines.push(
      `  ${(row.sumDur / 1000).toFixed(1).padStart(10)} ms Σ  n=${String(row.count).padStart(6)}  max=${(row.maxDur / 1000).toFixed(1).padStart(8)} ms  ${row.name}`
    );
  }
  lines.push("");
  const catsForDisplay = opts.showInspectorCats
    ? agg.byCat
    : agg.byCat.filter((row) => !row.cat.includes("v8.inspector"));
  lines.push(
    opts.showInspectorCats
      ? `-- Top ${agg.topN} categories on main thread (inclusive wall) --`
      : `-- Top ${agg.topN} categories on main thread (inclusive wall; v8.inspector omitted — use --show-inspector-cats) --`
  );
  for (const row of catsForDisplay.slice(0, agg.topN)) {
    lines.push(
      `  ${(row.sumDur / 1000).toFixed(1).padStart(10)} ms Σ  n=${String(row.count).padStart(7)}  ${row.cat}`
    );
  }
  lines.push("");

  return lines.join("\n");
}

function parseArgs(argv) {
  const out = {
    quiet: false,
    longMs: 50,
    frameMs: 16,
    minAggUs: 500,
    top: 40,
    threadKey: null,
    showInspectorCats: false,
    files: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--quiet") out.quiet = true;
    else if (a === "--show-inspector-cats") out.showInspectorCats = true;
    else if (a === "--long-ms") out.longMs = Number(argv[++i]) || 50;
    else if (a === "--frame-ms") out.frameMs = Number(argv[++i]) || 16;
    else if (a === "--min-agg-us") out.minAggUs = Number(argv[++i]) || 500;
    else if (a === "--top") out.top = Number(argv[++i]) || 40;
    else if (a === "--thread") out.threadKey = String(argv[++i] ?? "");
    else if (!a.startsWith("-")) out.files.push(a);
  }
  return out;
}

async function main() {
  const raw = process.argv.slice(2);
  const opts = parseArgs(raw);
  let files = opts.files;
  if (files.length === 0) {
    files = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith(".json") && f.toLowerCase().includes("chrome-trace"))
      .map((f) => path.join(__dirname, f))
      .sort();
  }

  if (files.length === 0) {
    console.error("No JSON files. Pass paths or place chrome-trace*.json in docs/chrome-profiling/");
    process.exit(1);
  }

  const blocks = [];
  for (const f of files) {
    const abs = path.isAbsolute(f) ? f : path.resolve(process.cwd(), f);
    if (!fs.existsSync(abs)) {
      console.error(`Missing: ${abs}`);
      process.exit(1);
    }
    if (!opts.quiet) console.error(`Reading ${abs} (2 passes, streaming) ...`);
    blocks.push(
      await summarizeFile(abs, {
        longMs: opts.longMs,
        frameMs: opts.frameMs,
        minAggUs: opts.minAggUs,
        top: opts.top,
        threadKey: opts.threadKey,
        showInspectorCats: opts.showInspectorCats,
      })
    );
  }
  process.stdout.write(blocks.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
