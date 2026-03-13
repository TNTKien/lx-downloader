/**
 * Styled terminal logger with progress bar support.
 * Zero dependencies — uses ANSI escape codes directly.
 */

const isColorSupported =
  process.env.FORCE_COLOR !== "0" &&
  (process.env.FORCE_COLOR !== undefined || (process.stdout.isTTY ?? false));

// --- ANSI helpers ---

const esc = (code: string) => (isColorSupported ? `\x1b[${code}m` : "");

const reset = esc("0");
const bold = esc("1");
const dim = esc("2");
const cyan = esc("36");
const green = esc("32");
const yellow = esc("33");
const red = esc("31");
const magenta = esc("35");
const gray = esc("90");

// --- Formatters ---

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds}s`;
}

function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${gray}${h}:${m}:${s}${reset}`;
}

// --- Icons ---

const ICONS = {
  story: `${magenta}${bold}[TRUYEN]${reset}`,
  chapter: `${cyan}${bold}[CHAP]${reset}`,
  image: `${dim}[ANH]${reset}`,
  done: `${green}${bold}[XONG]${reset}`,
  error: `${red}${bold}[LOI]${reset}`,
  warn: `${yellow}[WARN]${reset}`,
  info: `${cyan}[INFO]${reset}`,
  retry: `${yellow}[RETRY]${reset}`,
  archive: `${magenta}[ZIP]${reset}`,
  skip: `${gray}[SKIP]${reset}`,
} as const;

// --- Core log ---

function write(message: string): void {
  process.stdout.write(`${message}\n`);
}

export const log = {
  story(title: string, chapterCount: number): void {
    write(`${timestamp()} ${ICONS.story} ${bold}${title}${reset} ${dim}(${chapterCount} chapter)${reset}`);
  },

  chapterStart(title: string, index?: number, total?: number): void {
    const counter = index !== undefined && total !== undefined ? `${dim}[${index}/${total}]${reset} ` : "";
    write(`${timestamp()} ${ICONS.chapter} ${counter}${title}`);
  },

  chapterDone(title: string, imageCount: number, durationMs: number): void {
    write(
      `${timestamp()} ${ICONS.done} ${title} ${dim}(${imageCount} anh, ${formatDuration(durationMs)})${reset}`,
    );
  },

  imageProgress(current: number, total: number): void {
    if (!process.stdout.isTTY) {
      return;
    }
    const pct = Math.round((current / total) * 100);
    const barWidth = 30;
    const filled = Math.round((current / total) * barWidth);
    const empty = barWidth - filled;
    const bar = `${green}${"█".repeat(filled)}${gray}${"░".repeat(empty)}${reset}`;
    const text = `  ${bar} ${bold}${pct}%${reset} ${dim}(${current}/${total})${reset}`;
    process.stdout.write(`\r${text}`);
    if (current === total) {
      process.stdout.write("\n");
    }
  },

  retry(what: string, attempt: number, maxAttempts: number, delayMs: number): void {
    write(
      `${timestamp()} ${ICONS.retry} ${what} ${dim}(lan ${attempt}/${maxAttempts}, doi ${formatDuration(delayMs)})${reset}`,
    );
  },

  archiveStart(name: string): void {
    write(`${timestamp()} ${ICONS.archive} Dang nen: ${name}`);
  },

  archiveDone(name: string): void {
    write(`${timestamp()} ${ICONS.done} Nen xong: ${name}`);
  },

  error(message: string): void {
    write(`${timestamp()} ${ICONS.error} ${red}${message}${reset}`);
  },

  warn(message: string): void {
    write(`${timestamp()} ${ICONS.warn} ${yellow}${message}${reset}`);
  },

  info(message: string): void {
    write(`${timestamp()} ${ICONS.info} ${message}`);
  },

  skip(message: string): void {
    write(`${timestamp()} ${ICONS.skip} ${gray}${message}${reset}`);
  },

  /** Final summary after full story download */
  summary(storyTitle: string, totalChapters: number, totalImages: number, totalDurationMs: number): void {
    const line = `${dim}${"─".repeat(50)}${reset}`;
    write(line);
    write(`${ICONS.done} ${bold}Hoan tat: ${storyTitle}${reset}`);
    write(`  ${dim}Chapters:${reset} ${totalChapters}  ${dim}Anh:${reset} ${totalImages}  ${dim}Thoi gian:${reset} ${formatDuration(totalDurationMs)}`);
    write(line);
  },

  /** Print a blank line */
  blank(): void {
    write("");
  },
};
