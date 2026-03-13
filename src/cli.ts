#!/usr/bin/env bun

import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { Command, InvalidArgumentError } from "commander";

import { downloadFromInput } from "./downloader";
import { log } from "./logger";
import type { ArchiveMode, CliOptions } from "./types";

const ARCHIVE_MODES: ArchiveMode[] = ["none", "chapter", "story", "both"];

function parseArchiveMode(value: string): ArchiveMode {
  if (ARCHIVE_MODES.includes(value as ArchiveMode)) {
    return value as ArchiveMode;
  }

  throw new InvalidArgumentError(`archive phai la mot trong: ${ARCHIVE_MODES.join(", ")}`);
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Gia tri phai la so nguyen duong");
  }

  return parsed;
}

async function promptForUrl(): Promise<string> {
  const rl = createInterface({ input, output });

  try {
    const answer = await rl.question("Nhap link truyện hoac chapter: ");
    if (!answer.trim()) {
      throw new Error("Ban chua nhap link");
    }

    return answer.trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("lx-downloader")
    .description("CLI tai truyện tu lxmanga.space")
    .argument("[url]", "link truyện hoặc link chapter")
    .option("-o, --output <dir>", "thu muc luu file", path.join(process.cwd(), "downloaded"))
    .option("-a, --archive <mode>", "nen chapter/truyen: none|chapter|story|both", parseArchiveMode, "none")
    .option("-c, --concurrency <number>", "so request tai anh song song", parsePositiveInteger, 4)
    .option("-t, --token <value>", "gia tri header Token khi tai anh", "lx-downloader")
    .action(async (url: string | undefined, flags: { output: string; archive: ArchiveMode; concurrency: number; token: string }) => {
      const resolvedUrl = url ?? (await promptForUrl());
      const options: CliOptions = {
        outputDir: path.resolve(flags.output),
        archiveMode: flags.archive,
        concurrency: flags.concurrency,
        token: flags.token,
      };

      await downloadFromInput(resolvedUrl, options);
    });

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error(message);
  process.exitCode = 1;
});
