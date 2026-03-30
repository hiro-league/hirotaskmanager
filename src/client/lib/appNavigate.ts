import type { NavigateFunction } from "react-router-dom";

let impl: NavigateFunction | null = null;

/** Called from a component under the router (e.g. once on mount). */
export function registerAppNavigate(fn: NavigateFunction | null): void {
  impl = fn;
}

/** Imperative navigation for mutations and non-component code. */
export function appNavigate(
  to: string,
  options?: { replace?: boolean },
): void {
  impl?.(to, { replace: options?.replace ?? false });
}
