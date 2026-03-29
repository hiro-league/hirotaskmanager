import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Board, BoardIndexEntry } from "../shared/models";

const DATA_DIR = path.join(process.cwd(), "data");
const BOARDS_DIR = path.join(DATA_DIR, "boards");
const INDEX_PATH = path.join(DATA_DIR, "_index.json");

export async function ensureDataDirs(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(BOARDS_DIR, { recursive: true });
}

function boardFilePath(id: string): string {
  return path.join(BOARDS_DIR, `${id}.json`);
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

export async function readBoardFile(id: string): Promise<Board | null> {
  try {
    const raw = await readFile(boardFilePath(id), "utf-8");
    return JSON.parse(raw) as Board;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw e;
  }
}

export async function writeBoardAtomic(board: Board): Promise<void> {
  await atomicWriteJson(boardFilePath(board.id), board);
}

export async function deleteBoardFile(id: string): Promise<void> {
  await unlink(boardFilePath(id)).catch((e) => {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw e;
  });
}

export async function syncIndexFromBoard(board: Board): Promise<void> {
  const index = await readBoardIndex();
  const i = index.findIndex((e) => e.id === board.id);
  const row: BoardIndexEntry = {
    id: board.id,
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
