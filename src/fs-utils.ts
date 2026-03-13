import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RootSeriesMap, StoryMeta } from "./types";

const ROOT_MAP_FILE = ".lx-downloader-map.json";
const STORY_META_FILE = ".lx-meta.json";

export function sanitizeName(input: string): string {
  const normalized = input
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return normalized || "untitled";
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  if (!(await pathExists(filePath))) {
    return fallback;
  }

  try {
    const content = await Bun.file(filePath).text();
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function loadRootSeriesMap(downloadRoot: string): Promise<RootSeriesMap> {
  return readJsonFile(path.join(downloadRoot, ROOT_MAP_FILE), { series: {} });
}

export async function saveRootSeriesMap(downloadRoot: string, map: RootSeriesMap): Promise<void> {
  await writeJsonFile(path.join(downloadRoot, ROOT_MAP_FILE), map);
}

export async function resolveStoryDirectory(
  downloadRoot: string,
  storySlug: string,
  storyTitle: string,
): Promise<string> {
  await ensureDir(downloadRoot);

  const rootMap = await loadRootSeriesMap(downloadRoot);
  const mappedName = rootMap.series[storySlug];

  if (mappedName) {
    const mappedPath = path.join(downloadRoot, mappedName);
    await ensureDir(mappedPath);
    return mappedPath;
  }

  const preferredName = sanitizeName(storyTitle);
  const preferredPath = path.join(downloadRoot, preferredName);
  await ensureDir(preferredPath);

  rootMap.series[storySlug] = preferredName;
  await saveRootSeriesMap(downloadRoot, rootMap);

  return preferredPath;
}

export async function loadStoryMeta(storyDir: string, fallback: StoryMeta): Promise<StoryMeta> {
  return readJsonFile(path.join(storyDir, STORY_META_FILE), fallback);
}

export async function saveStoryMeta(storyDir: string, meta: StoryMeta): Promise<void> {
  await writeJsonFile(path.join(storyDir, STORY_META_FILE), meta);
}

export async function resolveChapterDirectory(
  storyDir: string,
  storyMeta: StoryMeta,
  chapterSlug: string,
  chapterTitle: string,
): Promise<string> {
  const mappedName = storyMeta.chapters[chapterSlug];
  if (mappedName) {
    const mappedPath = path.join(storyDir, mappedName);
    await ensureDir(mappedPath);
    return mappedPath;
  }

  const preferredName = sanitizeName(chapterTitle);
  let candidateName = preferredName;
  let counter = 2;

  while (await pathExists(path.join(storyDir, candidateName))) {
    candidateName = `${preferredName} (${counter})`;
    counter += 1;
  }

  const chapterDir = path.join(storyDir, candidateName);
  await ensureDir(chapterDir);
  storyMeta.chapters[chapterSlug] = candidateName;
  await saveStoryMeta(storyDir, storyMeta);

  return chapterDir;
}

export async function clearChapterPayload(chapterDir: string): Promise<void> {
  if (!(await pathExists(chapterDir))) {
    return;
  }

  const entries = await readdir(chapterDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.name !== STORY_META_FILE)
      .map((entry) => rm(path.join(chapterDir, entry.name), { recursive: true, force: true })),
  );
}
