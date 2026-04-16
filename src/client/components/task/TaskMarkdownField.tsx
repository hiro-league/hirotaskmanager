import { useEffect, useLayoutEffect } from "react";
import type { RefObject } from "react";
import MDEditor, { type RefMDEditor } from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import type { Components } from "react-markdown";

function useMdEditorToolbarTabSkip(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;
    const apply = () => {
      for (const tb of root.querySelectorAll<HTMLElement>(".w-md-editor-toolbar")) {
        for (const el of tb.querySelectorAll<HTMLElement>(
          "button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex='-1'])",
        )) {
          if (el.tabIndex >= 0) el.tabIndex = -1;
        }
      }
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [enabled, rootRef]);
}

export interface TaskMarkdownFieldProps {
  titleId: string;
  body: string;
  onBodyChange: (value: string) => void;
  disabled: boolean;
  bodyTabIndex: number;
  mdColorMode: "dark" | "light";
  markdownPreviewComponents: Partial<Components>;
  autoFocus: boolean;
  toolbarTabSkipEnabled: boolean;
  mdEditorRef: RefObject<RefMDEditor | null>;
  bodyTextareaRef: RefObject<HTMLTextAreaElement | null>;
  taskMdEditorWrapRef: RefObject<HTMLDivElement | null>;
}

/**
 * Task body markdown editor (`@uiw/react-md-editor`), including toolbar tab-order
 * normalization and textarea ref wiring for modal focus trap.
 */
export function TaskMarkdownField({
  titleId,
  body,
  onBodyChange,
  disabled,
  bodyTabIndex,
  mdColorMode,
  markdownPreviewComponents,
  autoFocus,
  toolbarTabSkipEnabled,
  mdEditorRef,
  bodyTextareaRef,
  taskMdEditorWrapRef,
}: TaskMarkdownFieldProps) {
  useLayoutEffect(() => {
    bodyTextareaRef.current =
      mdEditorRef.current?.textarea ??
      taskMdEditorWrapRef.current?.querySelector<HTMLTextAreaElement>(
        "textarea.w-md-editor-text-input",
      ) ??
      null;
    return () => {
      bodyTextareaRef.current = null;
    };
  });

  useMdEditorToolbarTabSkip(taskMdEditorWrapRef, toolbarTabSkipEnabled);

  return (
    <div
      ref={taskMdEditorWrapRef}
      className="task-md-editor min-h-[min(50vh,22rem)] w-full overflow-hidden rounded-md [&_.w-md-editor]:w-full [&_.w-md-editor]:rounded-md"
    >
      <MDEditor
        ref={mdEditorRef}
        value={body}
        onChange={(v) => onBodyChange(v ?? "")}
        preview="live"
        height={420}
        visibleDragbar
        autoFocus={autoFocus}
        data-color-mode={mdColorMode}
        previewOptions={{
          components: markdownPreviewComponents,
        }}
        textareaProps={{
          id: `${titleId}-body`,
          disabled,
          "aria-label": "Task body (markdown)",
          tabIndex: bodyTabIndex,
        }}
      />
    </div>
  );
}
