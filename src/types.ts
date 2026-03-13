export type ArchiveMode = "none" | "chapter" | "story" | "both";

export type InputTarget =
  | {
      kind: "story";
      url: string;
      slug: string;
    }
  | {
      kind: "chapter";
      url: string;
      storySlug: string;
      chapterSlug: string;
    };

export interface CliOptions {
  outputDir: string;
  archiveMode: ArchiveMode;
  concurrency: number;
  token: string;
}

export interface StoryIndex {
  title: string;
  slug: string;
  url: string;
  chapterUrls: string[];
}

export interface ChapterData {
  storyTitle: string;
  storySlug: string;
  storyUrl: string;
  chapterTitle: string;
  chapterSlug: string;
  chapterUrl: string;
  imageUrls: string[];
}

export interface RootSeriesMap {
  series: Record<string, string>;
}

export interface StoryMeta {
  storyTitle: string;
  storySlug: string;
  sourceUrl: string;
  chapters: Record<string, string>;
}
