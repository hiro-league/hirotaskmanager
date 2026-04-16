import type { CreatorPrincipalType } from "./provenance";

export function normalizePrincipal(
  raw: string | null | undefined,
): CreatorPrincipalType | undefined {
  if (raw === "web" || raw === "cli" || raw === "system") return raw;
  return undefined;
}
