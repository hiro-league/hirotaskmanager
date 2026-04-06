import type { Context } from "hono";
import type { CreatorPrincipalType } from "../shared/provenance";
import { getRequestAuthContext, type AppBindings } from "./auth";
import { parseNotificationClientContext } from "./notifications/clientContext";

export interface RowProvenance {
  principal: CreatorPrincipalType;
  label: string | null;
}

/** Persisted creator metadata for boards, lists, and tasks (web vs cli, not spoofable for auth). */
export function provenanceForWrite(c: Context<AppBindings>): RowProvenance {
  const auth = getRequestAuthContext(c);
  const ctx = parseNotificationClientContext(c);
  if (auth.principal === "web") {
    return { principal: "web", label: ctx.clientName };
  }
  return { principal: "cli", label: ctx.clientName };
}
