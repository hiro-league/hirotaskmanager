#!/usr/bin/env node
/**
 * Condenses React DevTools Profiler JSON exports (version 5) into text summaries
 * small enough to share or paste into chat. Large raw exports are impractical to
 * inspect by hand or load into tooling as a whole.
 *
 * Usage:
 *   node docs/profiling/summarize-profiler-export.mjs [file.json ...]
 *   node docs/profiling/summarize-profiler-export.mjs   # all *.json in this directory
 *   node ... --quiet   # no progress on stderr (nice when redirecting stdout to a file)
 *
 * For very large files, if Node OOMs: node --max-old-space-size=8192 ...
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function displayNameForFiber(id, node, idToName) {
  if (node && typeof node.displayName === "string" && node.displayName.length > 0) {
    return node.displayName;
  }
  return `(anonymous#${id})`;
}

/** Collapse React Profiler updater lists (often hundreds of duplicates) for readable one-line output. */
function formatUpdaters(updaters) {
  if (!Array.isArray(updaters) || updaters.length === 0) return "(unknown)";
  const counts = new Map();
  for (const u of updaters) {
    const name = u?.displayName || `(fiber#${u?.id})`;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([n, c]) => (c > 1 ? `${n}×${c}` : n))
    .join(", ");
}

function buildFiberMap(snapshots) {
  const map = new Map();
  if (!Array.isArray(snapshots)) return map;
  for (const entry of snapshots) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const id = entry[0];
    const node = entry[1];
    map.set(id, node);
  }
  return map;
}

function summarizeFile(filePath) {
  const buf = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(buf);

  if (data.version !== 5) {
    console.warn(`\n[WARN] ${path.basename(filePath)}: expected version 5, got ${data.version}\n`);
  }

  const roots = data.dataForRoots ?? [];
  /** @type {Map<string, { totalMs: number, fiberSamples: number, maxFiberMs: number }>} */
  const byName = new Map();
  const slowCommits = [];

  let totalCommits = 0;
  let sumCommitDuration = 0;
  let maxCommitDuration = 0;
  let sumEffect = 0;
  let sumPassiveEffect = 0;

  for (const root of roots) {
    const idToNode = buildFiberMap(root.snapshots);
    const commits = root.commitData ?? [];

    for (const commit of commits) {
      totalCommits += 1;
      const d = Number(commit.duration) || 0;
      sumCommitDuration += d;
      maxCommitDuration = Math.max(maxCommitDuration, d);
      sumEffect += Number(commit.effectDuration) || 0;
      sumPassiveEffect += Number(commit.passiveEffectDuration) || 0;

      const updaterList = commit.updaters ?? [];

      const fiberPairs = commit.fiberActualDurations ?? [];
      let commitFiberSum = 0;
      for (const pair of fiberPairs) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const fid = pair[0];
        const ms = Number(pair[1]) || 0;
        commitFiberSum += ms;
        const node = idToNode.get(fid);
        const name = displayNameForFiber(fid, node, idToNode);
        let agg = byName.get(name);
        if (!agg) {
          agg = { totalMs: 0, fiberSamples: 0, maxFiberMs: 0 };
          byName.set(name, agg);
        }
        agg.totalMs += ms;
        agg.fiberSamples += 1;
        agg.maxFiberMs = Math.max(agg.maxFiberMs, ms);
      }

      slowCommits.push({
        duration: d,
        effectDuration: Number(commit.effectDuration) || 0,
        passiveEffectDuration: Number(commit.passiveEffectDuration) || 0,
        fiberSum: commitFiberSum,
        updaters: updaterList,
        timestamp: commit.timestamp,
      });
    }
  }

  slowCommits.sort((a, b) => b.duration - a.duration);

  const ranked = [...byName.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.totalMs - a.totalMs);

  const base = path.basename(filePath);
  const lines = [];
  lines.push(`=== ${base} ===`);
  lines.push(`commits: ${totalCommits}`);
  if (totalCommits > 0) {
    lines.push(
      `commit duration (ms): total=${sumCommitDuration.toFixed(1)} mean=${(sumCommitDuration / totalCommits).toFixed(1)} max=${maxCommitDuration.toFixed(1)}`
    );
  }
  lines.push(
    `effects (ms): layout/effect=${sumEffect.toFixed(1)} passive=${sumPassiveEffect.toFixed(1)}`
  );
  lines.push("");
  lines.push(`-- Top 30 components by summed fiber actual time (ms) across all commits --`);
  for (const row of ranked.slice(0, 30)) {
    lines.push(
      `  ${row.totalMs.toFixed(1).padStart(10)} ms  samples=${String(row.fiberSamples).padStart(6)}  max=${row.maxFiberMs.toFixed(1).padStart(8)}  ${row.name}`
    );
  }
  lines.push("");
  lines.push(`-- 12 slowest commits (commit duration ms) --`);
  for (const c of slowCommits.slice(0, 12)) {
    lines.push(
      `  ${c.duration.toFixed(1).padStart(8)} ms  fiberΣ=${c.fiberSum.toFixed(1).padStart(8)}  fx=${c.effectDuration.toFixed(1)}/${c.passiveEffectDuration.toFixed(1)}  updaters: ${formatUpdaters(c.updaters)}`
    );
  }
  lines.push("");

  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const quiet = args.includes("--quiet");
  let files = args.filter((a) => !a.startsWith("-"));
  if (files.length === 0) {
    files = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith(".json") && f !== "package.json")
      .map((f) => path.join(__dirname, f))
      .sort();
  }

  if (files.length === 0) {
    console.error("No JSON files. Pass paths or place exports in docs/profiling/");
    process.exit(1);
  }

  const out = [];
  for (const f of files) {
    const abs = path.isAbsolute(f) ? f : path.resolve(process.cwd(), f);
    if (!fs.existsSync(abs)) {
      console.error(`Missing: ${abs}`);
      process.exit(1);
    }
    if (!quiet) console.error(`Reading ${abs} ...`);
    out.push(summarizeFile(abs));
  }
  process.stdout.write(out.join("\n"));
}

main();
