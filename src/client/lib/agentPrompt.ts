/** Web entrypoint so the browser can hand off to Cursor (see cursor.com deeplink docs). */
const CURSOR_PROMPT_WEB_BASE = "https://cursor.com/link/prompt";

/** Cursor documents an 8,000-character cap on deeplink URLs after encoding. */
export const CURSOR_AGENT_PROMPT_URL_MAX_LENGTH = 8000;

/**
 * Plain-text prompt for AI agents: numeric ids (no locale grouping), board id not slug,
 * title only (no body or link). No blank line before the title line — agents parse more reliably.
 */
export function buildHiroAgentPromptText(input: {
  taskId: number;
  boardId: number;
  /** Visible title line (e.g. from {@link taskDisplayTitle}). */
  titleForDisplay: string;
}): string {
  const opener = `Regarding task #${input.taskId} on board ${input.boardId} in Hiro Task Manager, can you help with the following?`;
  return `${opener}\nTitle: ${input.titleForDisplay}`;
}

/** Returns `null` if the URL would exceed Cursor’s documented limit. */
export function cursorPromptUrlForText(promptText: string): string | null {
  const u = new URL(CURSOR_PROMPT_WEB_BASE);
  u.searchParams.set("text", promptText);
  const href = u.toString();
  if (href.length > CURSOR_AGENT_PROMPT_URL_MAX_LENGTH) return null;
  return href;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error("[agentPrompt] clipboard write failed", err);
    throw err;
  }
}
