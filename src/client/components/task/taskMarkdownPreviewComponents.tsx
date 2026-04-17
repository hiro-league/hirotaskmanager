import type { Element, ElementContent } from "hast";
import { lazy, Suspense } from "react";
import type { Components } from "react-markdown";
import type { ExtraProps } from "react-markdown";
import type { ReactNode } from "react";

const LazyMermaidDiagram = lazy(() =>
  import("./MermaidDiagram").then((m) => ({ default: m.MermaidDiagram })),
);

/** Hoisted: runs per fenced code block in preview (react-best-practices P4.3). */
const CODE_BLOCK_LANGUAGE_CLASS_RE = /language-(\w+)/;

/**
 * Equivalent to `rehype-rewrite` `getCodeString` for hast `ElementContent[]` trees.
 * Inlined so the preview path does not depend on `rehype-rewrite` (bundle-conditional).
 */
function hastCodeChildrenToString(
  children: ElementContent[] = [],
  code = "",
): string {
  for (const node of children) {
    if (node.type === "text") {
      code += node.value;
    } else if (
      node.type === "element" &&
      node.children &&
      Array.isArray(node.children)
    ) {
      code += hastCodeChildrenToString(node.children as ElementContent[]);
    }
  }
  return code;
}

/**
 * Recover fenced block text for Mermaid. `react-markdown` passes `children` as React
 * nodes, so `String(children)` becomes "[object Object]…". The official uiw example uses
 * the hast `node` and `getCodeString(node.children)` instead.
 * @see https://github.com/uiwjs/react-md-editor#support-custom-mermaid-preview
 */
function mermaidSourceFromCodeNode(
  node: ExtraProps["node"],
  fallbackChildren: ReactNode,
): string {
  const el = node as Element | undefined;
  if (el?.children && Array.isArray(el.children)) {
    return hastCodeChildrenToString(el.children as ElementContent[]).replace(
      /\n$/,
      "",
    );
  }
  if (typeof fallbackChildren === "string") {
    return fallbackChildren.replace(/\n$/, "");
  }
  return "";
}

/**
 * Custom react-markdown elements for the task body preview (via @uiw/react-md-editor).
 * Renders ```mermaid fenced blocks as diagrams; other code uses the default <code> element.
 */
export function createTaskMarkdownPreviewComponents(
  colorMode: "light" | "dark",
): Partial<Components> {
  return {
    code({ className, children, node, ...rest }) {
      const match = CODE_BLOCK_LANGUAGE_CLASS_RE.exec(className || "");
      if (match?.[1]?.toLowerCase() === "mermaid") {
        const chart = mermaidSourceFromCodeNode(node, children);
        return (
          <div className="my-1 w-full min-w-0">
            <Suspense
              fallback={
                <div className="rounded-md border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                  Loading diagram…
                </div>
              }
            >
              <LazyMermaidDiagram chart={chart} colorMode={colorMode} />
            </Suspense>
          </div>
        );
      }
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    },
  };
}
