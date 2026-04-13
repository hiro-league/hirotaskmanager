import type { Element, ElementContent } from "hast";
import type { Components } from "react-markdown";
import type { ExtraProps } from "react-markdown";
import type { ReactNode } from "react";
import { getCodeString } from "rehype-rewrite";
import { MermaidDiagram } from "./MermaidDiagram";

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
    return getCodeString(el.children as ElementContent[]).replace(/\n$/, "");
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
      const match = /language-(\w+)/.exec(className || "");
      if (match?.[1]?.toLowerCase() === "mermaid") {
        const chart = mermaidSourceFromCodeNode(node, children);
        return (
          <div className="my-1 w-full min-w-0">
            <MermaidDiagram chart={chart} colorMode={colorMode} />
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
