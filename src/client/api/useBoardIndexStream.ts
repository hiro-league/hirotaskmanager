import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { devDirectApiOrigin } from "./devDirectApiOrigin";
import { boardKeys } from "./queries";

/** Shell-wide SSE: `GET /api/events` without boardId — keep sidebar board list in sync with CLI/agent writes. */
function boardIndexEventsUrl(): string {
  const path = "/api/events";
  if (import.meta.env.PROD) return path;
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined;
  const fallbackOrigin = devDirectApiOrigin();
  const origin =
    raw && raw.length > 0 ? raw.replace(/\/$/, "") : fallbackOrigin;
  return `${origin}${path}`;
}

export function useBoardIndexStream(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const es = new EventSource(boardIndexEventsUrl(), {
      withCredentials: true,
    });

    const onIndexChanged = () => {
      void qc.invalidateQueries({ queryKey: boardKeys.all, exact: true });
    };

    es.addEventListener("board-index-changed", onIndexChanged);
    return () => {
      es.removeEventListener("board-index-changed", onIndexChanged);
      es.close();
    };
  }, [qc]);
}
