interface CurlOptions {
  url: string;
  headers?: Record<string, string>;
  outputPath?: string;
}

function buildCurlArgs(options: CurlOptions): string[] {
  const args = ["--silent", "--show-error", "--location", "--compressed"];

  for (const [name, value] of Object.entries(options.headers ?? {})) {
    args.push("-H", `${name}: ${value}`);
  }

  if (options.outputPath) {
    args.push("--output", options.outputPath);
  }

  args.push(options.url);
  return args;
}

async function runCurl(options: CurlOptions): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const process = Bun.spawn(["curl", ...buildCurlArgs(options)], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  return { stdout, stderr, exitCode };
}

export async function curlText(url: string, headers?: Record<string, string>): Promise<string> {
  const result = await runCurl({ url, headers });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `curl loi khi tai ${url}`);
  }

  return result.stdout;
}

export async function curlDownload(url: string, outputPath: string, headers?: Record<string, string>): Promise<void> {
  const result = await runCurl({ url, headers, outputPath });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `curl loi khi tai ${url}`);
  }
}
