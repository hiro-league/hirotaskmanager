import { CliError } from "./output";

export type BodySource = "flag" | "file" | "stdin";

export function resolveExclusiveBody(options: {
  body?: string;
  bodyFile?: string;
  bodyStdin?: boolean;
}): { source: BodySource; text: string } | undefined {
  const hasBody = options.body !== undefined;
  const hasFile = Boolean(options.bodyFile?.trim());
  const hasStdin = Boolean(options.bodyStdin);
  const n = (hasBody ? 1 : 0) + (hasFile ? 1 : 0) + (hasStdin ? 1 : 0);
  if (n > 1) {
    throw new CliError("Exactly one body input source is allowed", 2);
  }
  if (hasBody) {
    return { source: "flag", text: options.body ?? "" };
  }
  if (hasFile) {
    const path = options.bodyFile!.trim();
    return { source: "file", text: path };
  }
  if (hasStdin) {
    return { source: "stdin", text: "" };
  }
  return undefined;
}

export async function loadBodyText(
  resolved: { source: BodySource; text: string },
): Promise<string> {
  if (resolved.source === "flag") {
    return resolved.text;
  }
  if (resolved.source === "stdin") {
    return await readStdinUtf8();
  }
  const path = resolved.text;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new CliError("Body file not found", 1, { path });
  }
  return await file.text();
}

async function readStdinUtf8(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
