import { Copy } from "lucide-react";
import { useCallback, useMemo } from "react";
import { CursorMarkIcon } from "@/components/brand/CursorMarkIcon";
import {
  buildHiroAgentPromptText,
  copyTextToClipboard,
  CURSOR_AGENT_PROMPT_URL_MAX_LENGTH,
  cursorPromptUrlForText,
} from "@/lib/agentPrompt";
import { cn } from "@/lib/utils";

const ICON_BTN_CLASS =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background";

export interface TaskAgentPromptActionsProps {
  boardId: number;
  taskId: number;
  titleForDisplay: string;
  disabled?: boolean;
  className?: string;
}

export function TaskAgentPromptActions({
  boardId,
  taskId,
  titleForDisplay,
  disabled,
  className,
}: TaskAgentPromptActionsProps) {
  const { promptText, cursorUrl } = useMemo(() => {
    const promptText = buildHiroAgentPromptText({
      taskId,
      boardId,
      titleForDisplay,
    });
    return { promptText, cursorUrl: cursorPromptUrlForText(promptText) };
  }, [boardId, taskId, titleForDisplay]);

  const onCopy = useCallback(() => {
    void copyTextToClipboard(promptText).catch(() => {
      /* failure logged in copyTextToClipboard */
    });
  }, [promptText]);

  const onOpenCursor = useCallback(() => {
    if (cursorUrl == null) return;
    window.open(cursorUrl, "_blank", "noopener,noreferrer");
  }, [cursorUrl]);

  const cursorDisabled = disabled || cursorUrl == null;
  const cursorTitle =
    cursorUrl == null
      ? `Prompt too long for a Cursor link (max ${String(CURSOR_AGENT_PROMPT_URL_MAX_LENGTH)} characters in URL)`
      : "Open in Cursor";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        className={ICON_BTN_CLASS}
        disabled={disabled}
        aria-label="Copy Prompt"
        title="Copy Prompt"
        onClick={onCopy}
      >
        <Copy className="size-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className={ICON_BTN_CLASS}
        disabled={cursorDisabled}
        aria-label="Open in Cursor"
        title={cursorTitle}
        onClick={onOpenCursor}
      >
        <CursorMarkIcon className="size-4" />
      </button>
    </div>
  );
}
