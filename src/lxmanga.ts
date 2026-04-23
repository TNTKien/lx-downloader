import path from "node:path";

import * as cheerio from "cheerio";

import { curlText } from "./curl";
import type { ChapterData, InputTarget, StoryIndex } from "./types";

const SITE_ORIGIN = "https://lxmanga.space";
const IMAGE_HOST_PATTERN = /^https?:\/\/s\d+\.lxmanga\.\w+\//i;
const IMAGE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i;

function normalizeUrl(input: string): URL {
  const url = new URL(input.trim());

  if (url.hostname !== "lxmanga.space") {
    throw new Error("Chi ho tro link tu lxmanga.space");
  }

  url.hash = "";
  return url;
}

function getSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function absolutizeUrl(href: string): string {
  return new URL(href, SITE_ORIGIN).toString();
}

function browserHeaders(referer?: string): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: referer ?? SITE_ORIGIN,
  };
}

export function getImageRequestHeaders(token: string): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: SITE_ORIGIN,
    Referer: `${SITE_ORIGIN}/`,
    Token: token,
  };
}

async function fetchHtml(url: string, referer?: string): Promise<string> {
  return curlText(url, browserHeaders(referer));
}

function lastTitleTag($: cheerio.CheerioAPI): string {
  return $("title").last().text().replace(/\s+/g, " ").trim();
}

function prettifySlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

function getMetaContent($: cheerio.CheerioAPI, name: string): string | null {
  return $(name).attr("content")?.trim() ?? null;
}

function isChapterImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && IMAGE_EXTENSION_PATTERN.test(url) && IMAGE_HOST_PATTERN.test(url);
}

function dedupeImageUrls(imageUrls: string[]): string[] {
  const seen = new Set<string>();

  return imageUrls.filter((imageUrl) => {
    if (seen.has(imageUrl)) {
      return false;
    }

    seen.add(imageUrl);
    return true;
  });
}

function extractEncodedImageMatrix(html: string): number[][] | null {
  const match = html.match(/\b_u\s*=\s*(\[\[[\s\S]*?\]\])/);
  if (!match) {
    return null;
  }

  const parsed: unknown = JSON.parse(match[1]);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  const matrix: number[][] = [];
  for (const row of parsed) {
    if (!Array.isArray(row)) {
      return null;
    }

    const codes: number[] = [];
    for (const value of row) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
      }

      codes.push(value);
    }

    matrix.push(codes);
  }

  return matrix;
}

function xorDecodeImageUrl(codes: number[], key: string): string {
  return codes
    .map((code, index) => String.fromCharCode(code ^ key.charCodeAt(index % key.length)))
    .join("");
}

function extractDecodedImageUrls(html: string, $: cheerio.CheerioAPI): string[] {
  const actionToken = getMetaContent($, 'meta[name="action_token"]');
  if (!actionToken) {
    return [];
  }

  const encodedMatrix = extractEncodedImageMatrix(html);
  if (!encodedMatrix) {
    return [];
  }

  return dedupeImageUrls(
    encodedMatrix
      .map((codes) => xorDecodeImageUrl(codes, actionToken).trim())
      .filter((imageUrl) => isChapterImageUrl(imageUrl)),
  );
}

function extractLegacyImageUrls($: cheerio.CheerioAPI): string[] {
  const imageUrls: string[] = [];

  $("[data-src]").each((_, element) => {
    const dataSrc = $(element).attr("data-src")?.trim();
    if (!dataSrc || !isChapterImageUrl(dataSrc)) {
      return;
    }

    imageUrls.push(dataSrc);
  });

  return dedupeImageUrls(imageUrls);
}

function extractStoryTitle($: cheerio.CheerioAPI, fallbackSlug: string): string {
  const ogTitle = getMetaContent($, 'meta[property="og:title"]');
  const title = lastTitleTag($);

  const storyFromTitle = title.replace(/\s+-\s+LXMANGA$/i, "").trim();
  return ogTitle ?? (storyFromTitle || prettifySlug(fallbackSlug));
}

function extractChapterTitleAndStory($: cheerio.CheerioAPI, storySlug: string, chapterSlug: string): { storyTitle: string; chapterTitle: string } {
  const title = lastTitleTag($);
  const match = title.match(/^(.*?)\s+-\s+(.*?)\s+-\s+LXMANGA$/i);
  if (match) {
    return {
      chapterTitle: match[1].trim(),
      storyTitle: match[2].trim(),
    };
  }

  const ogTitle = getMetaContent($, 'meta[property="og:title"]') ?? "";
  const chapterFromOg = ogTitle.includes("-") ? ogTitle.split("-").pop()?.trim() : null;

  return {
    storyTitle: extractStoryTitle($, storySlug),
    chapterTitle: chapterFromOg || prettifySlug(chapterSlug),
  };
}

export function parseInputTarget(input: string): InputTarget {
  const url = normalizeUrl(input);
  const segments = getSegments(url);

  if (segments[0] !== "truyen" || segments.length < 2) {
    throw new Error("Link phai la link truyện hoac chapter cua lxmanga.space");
  }

  if (segments.length === 2) {
    return {
      kind: "story",
      url: url.toString(),
      slug: segments[1],
    };
  }

  return {
    kind: "chapter",
    url: url.toString(),
    storySlug: segments[1],
    chapterSlug: segments[2],
  };
}

export async function fetchStoryIndex(storyUrl: string): Promise<StoryIndex> {
  const html = await fetchHtml(storyUrl);
  const $ = cheerio.load(html);
  const storyUrlObject = normalizeUrl(storyUrl);
  const [, storySlug] = getSegments(storyUrlObject);

  const chapterUrls: string[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    const absolute = absolutizeUrl(href);
    const candidate = new URL(absolute);
    const segments = getSegments(candidate);

    if (candidate.hostname !== storyUrlObject.hostname) {
      return;
    }

    if (segments[0] !== "truyen" || segments[1] !== storySlug || segments.length !== 3) {
      return;
    }

    const normalized = candidate.toString();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      chapterUrls.push(normalized);
    }
  });

  if (chapterUrls.length === 0) {
    throw new Error(`Khong tim thay chapter nao trong ${storyUrl}`);
  }

  chapterUrls.reverse();

  return {
    title: extractStoryTitle($, storySlug),
    slug: storySlug,
    url: storyUrlObject.toString(),
    chapterUrls,
  };
}

export async function fetchChapterData(chapterUrl: string): Promise<ChapterData> {
  const html = await fetchHtml(chapterUrl, `${SITE_ORIGIN}/`);
  const $ = cheerio.load(html);
  const chapterUrlObject = normalizeUrl(chapterUrl);
  const [, storySlug, chapterSlug] = getSegments(chapterUrlObject);
  const titleInfo = extractChapterTitleAndStory($, storySlug, chapterSlug);

  const imageUrls = extractDecodedImageUrls(html, $);
  const finalImageUrls = imageUrls.length > 0 ? imageUrls : extractLegacyImageUrls($);

  if (finalImageUrls.length === 0) {
    throw new Error(`Khong tim thay anh nao trong ${chapterUrl}`);
  }

  return {
    storyTitle: titleInfo.storyTitle,
    storySlug,
    storyUrl: `${SITE_ORIGIN}/truyen/${storySlug}`,
    chapterTitle: titleInfo.chapterTitle,
    chapterSlug,
    chapterUrl: chapterUrlObject.toString(),
    imageUrls: finalImageUrls,
  };
}

export function extensionFromUrl(url: string): string {
  const ext = path.extname(new URL(url).pathname);
  return ext || ".jpg";
}
