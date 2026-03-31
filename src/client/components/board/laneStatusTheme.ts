function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
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

export function laneStatusRailClass(status: string): string {
  switch (normalizeStatus(status)) {
    case "open":
      return "bg-red-200/95 text-red-950 dark:bg-red-400/24 dark:text-red-100";
    case "in-progress":
      return "bg-amber-200/95 text-amber-950 dark:bg-amber-400/24 dark:text-amber-100";
    case "closed":
      return "bg-emerald-200/95 text-emerald-950 dark:bg-emerald-400/24 dark:text-emerald-100";
    default:
      return "bg-muted/70 text-foreground dark:bg-muted/30";
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

export function laneStatusAccentClass(status: string): string {
  switch (normalizeStatus(status)) {
    case "open":
      return "text-red-400/85 dark:text-red-300/70";
    case "in-progress":
      return "text-amber-400/85 dark:text-amber-300/70";
    case "closed":
      return "text-emerald-400/85 dark:text-emerald-300/70";
    default:
      return "text-border";
  }
}
