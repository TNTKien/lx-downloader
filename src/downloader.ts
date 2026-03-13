import path from "node:path";

import { archiveDirectory } from "./archive";
import { curlDownload } from "./curl";
import { clearChapterPayload, ensureDir, loadStoryMeta, resolveChapterDirectory, resolveStoryDirectory, saveStoryMeta } from "./fs-utils";
import { extensionFromUrl, fetchChapterData, fetchStoryIndex, getImageRequestHeaders, parseInputTarget } from "./lxmanga";
import { log } from "./logger";
import type { CliOptions, StoryMeta } from "./types";

// --- Retry configuration ---

interface RetryConfig {
  /** Max attempts per image download */
  maxAttempts: number;
  /** Base delay in ms (doubles each retry) */
  baseDelayMs: number;
  /** Max delay cap in ms */
  maxDelayMs: number;
  /** Max attempts for fetching chapter HTML */
  chapterFetchAttempts: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  chapterFetchAttempts: 3,
};

function getRetryDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff with jitter: base * 2^(attempt-1) + random jitter
  const exponential = config.baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * config.baseDelayMs;
  return Math.min(exponential + jitter, config.maxDelayMs);
}

// --- Download helpers ---

async function downloadBinary(
  url: string,
  outputPath: string,
  token: string,
  config: RetryConfig,
  label: string,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      await curlDownload(url, outputPath, getImageRequestHeaders(token));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < config.maxAttempts) {
        const delay = getRetryDelay(attempt, config);
        log.retry(label, attempt, config.maxAttempts, Math.round(delay));
        await Bun.sleep(delay);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Khong tai duoc anh ${url}`);
}

async function fetchChapterDataWithRetry(
  chapterUrl: string,
  config: RetryConfig,
  label: string,
): Promise<ReturnType<typeof fetchChapterData>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.chapterFetchAttempts; attempt += 1) {
    try {
      return await fetchChapterData(chapterUrl);
    } catch (error) {
      lastError = error;
      if (attempt < config.chapterFetchAttempts) {
        const delay = getRetryDelay(attempt, config);
        log.retry(label, attempt, config.chapterFetchAttempts, Math.round(delay));
        await Bun.sleep(delay);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Khong tai duoc chapter ${chapterUrl}`);
}

// --- Concurrency runner ---

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
}

// --- Chapter image download ---

async function downloadChapterAssets(
  chapterDir: string,
  imageUrls: string[],
  token: string,
  concurrency: number,
  retryConfig: RetryConfig,
): Promise<void> {
  await clearChapterPayload(chapterDir);
  let completed = 0;

  await runWithConcurrency(imageUrls, concurrency, async (imageUrl, index) => {
    const ext = extensionFromUrl(imageUrl);
    const fileName = `${String(index + 1).padStart(3, "0")}${ext}`;
    const outputPath = path.join(chapterDir, fileName);
    await downloadBinary(imageUrl, outputPath, token, retryConfig, `anh ${fileName}`);
    completed += 1;
    log.imageProgress(completed, imageUrls.length);
  });
}

// --- Public entry point ---

export async function downloadFromInput(rawInput: string, options: CliOptions): Promise<void> {
  const target = parseInputTarget(rawInput);
  await ensureDir(options.outputDir);
  const retryConfig = DEFAULT_RETRY;

  if (target.kind === "chapter") {
    await downloadSingleChapter(target.url, options, retryConfig);
    return;
  }

  await downloadFullStory(target.url, options, retryConfig);
}

// --- Single chapter ---

async function downloadSingleChapter(
  chapterUrl: string,
  options: CliOptions,
  retryConfig: RetryConfig,
): Promise<void> {
  const chapter = await fetchChapterDataWithRetry(chapterUrl, retryConfig, "tai trang chapter");
  const storyDir = await resolveStoryDirectory(options.outputDir, chapter.storySlug, chapter.storyTitle);
  const storyMeta: StoryMeta = await loadStoryMeta(storyDir, {
    storyTitle: chapter.storyTitle,
    storySlug: chapter.storySlug,
    sourceUrl: chapter.storyUrl,
    chapters: {},
  });

  storyMeta.storyTitle = chapter.storyTitle;
  storyMeta.sourceUrl = chapter.storyUrl;
  await saveStoryMeta(storyDir, storyMeta);

  const chapterDir = await resolveChapterDirectory(storyDir, storyMeta, chapter.chapterSlug, chapter.chapterTitle);
  const startTime = Date.now();
  log.chapterStart(chapter.chapterTitle);
  await downloadChapterAssets(chapterDir, chapter.imageUrls, options.token, options.concurrency, retryConfig);
  log.chapterDone(chapter.chapterTitle, chapter.imageUrls.length, Date.now() - startTime);

  if (options.archiveMode === "chapter" || options.archiveMode === "both") {
    const zipPath = `${chapterDir}.zip`;
    log.archiveStart(path.basename(zipPath));
    await archiveDirectory(chapterDir, zipPath);
    log.archiveDone(path.basename(zipPath));
  }

  if (options.archiveMode === "story" || options.archiveMode === "both") {
    const zipPath = `${storyDir}.zip`;
    log.archiveStart(path.basename(zipPath));
    await archiveDirectory(storyDir, zipPath);
    log.archiveDone(path.basename(zipPath));
  }

  log.info(`Luu tai: ${chapterDir}`);
}

// --- Full story ---

async function downloadFullStory(
  storyUrl: string,
  options: CliOptions,
  retryConfig: RetryConfig,
): Promise<void> {
  const story = await fetchStoryIndex(storyUrl);
  const storyDir = await resolveStoryDirectory(options.outputDir, story.slug, story.title);
  const storyMeta: StoryMeta = await loadStoryMeta(storyDir, {
    storyTitle: story.title,
    storySlug: story.slug,
    sourceUrl: story.url,
    chapters: {},
  });

  storyMeta.storyTitle = story.title;
  storyMeta.sourceUrl = story.url;
  await saveStoryMeta(storyDir, storyMeta);

  log.story(story.title, story.chapterUrls.length);
  log.blank();

  const overallStart = Date.now();
  let totalImages = 0;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < story.chapterUrls.length; i += 1) {
    const chapterUrl = story.chapterUrls[i];

    try {
      const chapter = await fetchChapterDataWithRetry(chapterUrl, retryConfig, `tai trang chapter ${i + 1}`);
      const chapterDir = await resolveChapterDirectory(storyDir, storyMeta, chapter.chapterSlug, chapter.chapterTitle);
      const chapterStart = Date.now();

      log.chapterStart(chapter.chapterTitle, i + 1, story.chapterUrls.length);
      await downloadChapterAssets(chapterDir, chapter.imageUrls, options.token, options.concurrency, retryConfig);
      log.chapterDone(chapter.chapterTitle, chapter.imageUrls.length, Date.now() - chapterStart);

      totalImages += chapter.imageUrls.length;
      successCount += 1;

      if (options.archiveMode === "chapter" || options.archiveMode === "both") {
        const zipPath = `${chapterDir}.zip`;
        log.archiveStart(path.basename(zipPath));
        await archiveDirectory(chapterDir, zipPath);
        log.archiveDone(path.basename(zipPath));
      }

      // Save meta after each chapter (crash resilience)
      await saveStoryMeta(storyDir, storyMeta);
    } catch (error) {
      failCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Chapter ${i + 1}: ${message}`);
      // Continue to next chapter instead of aborting the whole story
      continue;
    }
  }

  if (options.archiveMode === "story" || options.archiveMode === "both") {
    const zipPath = `${storyDir}.zip`;
    log.archiveStart(path.basename(zipPath));
    await archiveDirectory(storyDir, zipPath);
    log.archiveDone(path.basename(zipPath));
  }

  log.blank();
  log.summary(story.title, successCount, totalImages, Date.now() - overallStart);

  if (failCount > 0) {
    log.warn(`${failCount} chapter bi loi, chay lai de tai tiep.`);
  }

  log.info(`Luu tai: ${storyDir}`);
}
