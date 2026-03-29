import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import {
  normalizeBoardFromJson,
  type Board,
  type BoardIndexEntry,
} from "../shared/models";
import { slugify, uniqueSlug } from "../shared/slug";

function resolveDataDir(): string {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  if (process.env.NODE_ENV === "production") {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
    return path.join(home, ".taskmanager", "data");
  }
  return path.join(process.cwd(), "data");
}

const DATA_DIR = resolveDataDir();
const BOARDS_DIR = path.join(DATA_DIR, "boards");
const INDEX_PATH = path.join(DATA_DIR, "_index.json");

export async function ensureDataDirs(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(BOARDS_DIR, { recursive: true });
}

function boardFilePath(slug: string): string {
  return path.join(BOARDS_DIR, `${slug}.json`);
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmp = `${filePath}.${nanoid(10)}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  await writeFile(tmp, payload, "utf-8");
  try {
    await rename(tmp, filePath);
  } catch {
    await unlink(filePath).catch(() => {});
    await rename(tmp, filePath);
  }
}

export async function readBoardIndex(): Promise<BoardIndexEntry[]> {
  try {
    const raw = await readFile(INDEX_PATH, "utf-8");
    return JSON.parse(raw) as BoardIndexEntry[];
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw e;
  }
}

export async function writeBoardIndexAtomic(
  entries: BoardIndexEntry[],
): Promise<void> {
  await atomicWriteJson(INDEX_PATH, entries);
}

/** Resolve the slug for a board id by looking it up in the index. */
export async function slugForId(id: string): Promise<string | null> {
  const index = await readBoardIndex();
  const entry = index.find((e) => e.id === id);
  return entry?.slug ?? null;
}

/** Index row by stable board id or by slug (URL / client may use either). */
export async function entryByIdOrSlug(
  ref: string,
): Promise<BoardIndexEntry | null> {
  const index = await readBoardIndex();
  return (
    index.find((e) => e.id === ref) ??
    index.find((e) => e.slug === ref) ??
    null
  );
}

export async function readBoardFile(id: string): Promise<Board | null> {
  const slug = await slugForId(id);
  if (!slug) return null;
  try {
    const raw = await readFile(boardFilePath(slug), "utf-8");
    return normalizeBoardFromJson(JSON.parse(raw) as Record<string, unknown>);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw e;
  }
}

export async function writeBoardAtomic(board: Board, slug: string): Promise<void> {
  await atomicWriteJson(boardFilePath(slug), board);
}

export async function deleteBoardFile(slug: string): Promise<void> {
  await unlink(boardFilePath(slug)).catch((e) => {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw e;
  });
}

export async function renameBoardFile(oldSlug: string, newSlug: string): Promise<void> {
  if (oldSlug === newSlug) return;
  await rename(boardFilePath(oldSlug), boardFilePath(newSlug));
}

/**
 * Generate a unique slug for a new board name, considering existing index entries.
 * Optionally exclude a board id from collision checks (useful during rename).
 */
export async function generateSlug(
  name: string,
  excludeId?: string,
): Promise<string> {
  const index = await readBoardIndex();
  const taken = new Set(
    index.filter((e) => e.id !== excludeId).map((e) => e.slug),
  );
  return uniqueSlug(slugify(name), taken);
}

export async function syncIndexFromBoard(
  board: Board,
  slug: string,
): Promise<void> {
  const index = await readBoardIndex();
  const i = index.findIndex((e) => e.id === board.id);
  const row: BoardIndexEntry = {
    id: board.id,
    slug,
    name: board.name,
    createdAt: board.createdAt,
  };
  if (i === -1) {
    index.push(row);
  } else {
    index[i] = row;
  }
  await writeBoardIndexAtomic(index);
}

export async function removeBoardFromIndex(id: string): Promise<void> {
  const index = (await readBoardIndex()).filter((e) => e.id !== id);
  await writeBoardIndexAtomic(index);
}

/**
 * One-time migration: rename nanoid-based board files to slug-based filenames
 * and backfill the `slug` field in the index.
 */
export async function migrateToSlugs(): Promise<void> {
  const index = await readBoardIndex();
  if (index.length === 0) return;

  const alreadyMigrated = index.every((e) => e.slug);
  if (alreadyMigrated) return;

  const files = await readdir(BOARDS_DIR);
  const fileSet = new Set(files);
  const takenSlugs = new Set<string>();

  for (const entry of index) {
    if (entry.slug) {
      takenSlugs.add(entry.slug);
      continue;
    }

    const slug = uniqueSlug(slugify(entry.name), takenSlugs);
    takenSlugs.add(slug);
    entry.slug = slug;

    const oldFile = `${entry.id}.json`;
    const newFile = `${slug}.json`;
    if (fileSet.has(oldFile)) {
      await rename(
        path.join(BOARDS_DIR, oldFile),
        path.join(BOARDS_DIR, newFile),
      );
    }
  }

  await writeBoardIndexAtomic(index);
}
