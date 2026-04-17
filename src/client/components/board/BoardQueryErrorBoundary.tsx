import { Component, type ErrorInfo, type ReactNode } from "react";
import { Navigate } from "react-router-dom";

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
 * redirect to Trash for missing boards instead of an uncaught render throw (Priority 3 — Suspense).
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
      return <Navigate to="/trash" replace />;
    }
    if (error) {
      return (
        <div className="flex min-h-0 flex-1 flex-col p-8">
          <p className="text-destructive">{error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
