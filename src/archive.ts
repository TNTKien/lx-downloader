import { createWriteStream } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import archiver from "archiver";

async function collectEntries(directory: string, relative = ""): Promise<string[]> {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryRelativePath = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectEntries(directory, entryRelativePath)));
      continue;
    }

    if (entry.name.endsWith(".zip") || entry.name === ".lx-meta.json") {
      continue;
    }

    files.push(entryRelativePath);
  }

  return files;
}

export async function archiveDirectory(sourceDir: string, outputZipPath: string): Promise<void> {
  await rm(outputZipPath, { force: true });

  const files = await collectEntries(sourceDir);
  const output = createWriteStream(outputZipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const completion = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", (error: Error) => reject(error));
    archive.on("error", (error: Error) => reject(error));
  });

  archive.pipe(output);

  for (const file of files) {
    archive.file(path.join(sourceDir, file), { name: file });
  }

  await archive.finalize();
  await completion;
}
