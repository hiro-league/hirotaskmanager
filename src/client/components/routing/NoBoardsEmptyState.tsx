/**
 * Empty state shown at `/` when the user has zero boards.
 *
 * Distinct from `RedirectCountdownNotice` (which is for recoverable routing
 * errors): zero boards is a normal first-run state, not an error, so we do
 * NOT redirect or count down — we just tell the user what to do next.
 */
export function NoBoardsEmptyState() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
      data-testid="no-boards-empty-state"
    >
      <h1 className="text-balance text-lg font-medium text-foreground">
        No boards yet
      </h1>
      <p className="max-w-md text-pretty text-sm text-muted-foreground">
        Create a board from the sidebar to start tracking tasks.
      </p>
    </div>
  );
}
