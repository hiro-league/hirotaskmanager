function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

/** Workflow status accent dot — shared by header status toggles and lanes status rail. */
export function statusDotClass(status: string): string {
  switch (normalizeStatus(status)) {
    case "open":
      return "bg-red-400";
    case "in-progress":
      return "bg-amber-300";
    case "closed":
      return "bg-emerald-400";
    default:
      return "bg-muted-foreground/35";
  }
}

export function laneStatusTintClass(status: string): string {
  switch (normalizeStatus(status)) {
    case "open":
      return "bg-red-100/65 dark:bg-red-500/16";
    case "in-progress":
      return "bg-amber-100/65 dark:bg-amber-500/16";
    case "closed":
      return "bg-emerald-100/65 dark:bg-emerald-500/16";
    default:
      return "bg-muted/35 dark:bg-muted/20";
  }
}

export function laneStatusDividerClass(status: string): string {
  switch (normalizeStatus(status)) {
    case "open":
      return "border-red-300/85 dark:border-red-400/40";
    case "in-progress":
      return "border-amber-300/85 dark:border-amber-400/40";
    case "closed":
      return "border-emerald-300/85 dark:border-emerald-400/40";
    default:
      return "border-border/80";
  }
}
