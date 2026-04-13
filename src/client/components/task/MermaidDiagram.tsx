import { useEffect, useId, useRef } from "react";
import mermaid from "mermaid";

let lastMermaidTheme: string | null = null;

function ensureMermaidTheme(colorMode: "light" | "dark") {
  const theme = colorMode === "dark" ? "dark" : "default";
  if (lastMermaidTheme === theme) return;
  lastMermaidTheme = theme;
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: "loose",
  });
}

interface MermaidDiagramProps {
  chart: string;
  colorMode: "light" | "dark";
}

/**
 * Renders one Mermaid diagram for the task markdown preview.
 * Errors are shown in-place so a bad fence does not blank the whole preview.
 */
export function MermaidDiagram({ chart, colorMode }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    ensureMermaidTheme(colorMode);

    const renderId = `mermaid-${reactId}-${Math.random().toString(36).slice(2, 11)}`;
    el.replaceChildren();

    const text = chart.trim();
    if (!text) {
      const p = document.createElement("p");
      p.className = "text-sm text-muted-foreground";
      p.textContent = "Empty mermaid diagram";
      el.appendChild(p);
      return;
    }

    let cancelled = false;

    void mermaid
      .render(renderId, text, el)
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        bindFunctions?.(containerRef.current);
      })
      .catch((err: unknown) => {
        if (cancelled || !containerRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error("[mermaid]", message);
        const pre = document.createElement("pre");
        pre.className =
          "whitespace-pre-wrap break-words rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive";
        pre.setAttribute("role", "alert");
        pre.textContent = message;
        containerRef.current.replaceChildren(pre);
      });

    return () => {
      cancelled = true;
      el.replaceChildren();
    };
  }, [chart, colorMode, reactId]);

  return (
    <div
      ref={containerRef}
      className="flex min-h-[2rem] w-full justify-center overflow-x-auto [&_svg]:max-w-none"
    />
  );
}
