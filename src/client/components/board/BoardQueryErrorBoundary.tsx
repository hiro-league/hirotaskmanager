import { Component, type ErrorInfo, type ReactNode } from "react";
import { RedirectCountdownNotice } from "@/components/routing/RedirectCountdownNotice";

/** Board GET returns 404 JSON when the board is gone or in Trash. */
function isBoardDetailNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes("not found");
}

interface BoardQueryErrorBoundaryProps {
  children: ReactNode;
}

interface BoardQueryErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches errors from `useSuspenseQuery` for board fetch (e.g. network/404) so we can
 * show a friendly message and timed redirect home instead of an uncaught render throw (Priority 3 — Suspense).
 */
export class BoardQueryErrorBoundary extends Component<
  BoardQueryErrorBoundaryProps,
  BoardQueryErrorBoundaryState
> {
  constructor(props: BoardQueryErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): BoardQueryErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Under Vitest, full `console.error` + stacks looks like a failure; one info line + ◇ marks handled errors.
    const isVitestRuntime =
      typeof process !== "undefined" && process.env.VITEST === "true";
    if (isVitestRuntime) {
      console.info(
        "◇ BoardQueryErrorBoundary (test — expected in boundary specs):",
        error.message,
      );
      return;
    }
    console.error("BoardQueryErrorBoundary:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error && isBoardDetailNotFound(error)) {
      return (
        <RedirectCountdownNotice
          title="Board not found"
          description="This board ID or link doesn’t exist, or the board may have been removed."
        />
      );
    }
    if (error) {
      return (
        <RedirectCountdownNotice
          title="Couldn’t load this board"
          description="Something went wrong while loading the board. You can go home or wait for the redirect."
          detail={error.message}
        />
      );
    }
    return this.props.children;
  }
}
