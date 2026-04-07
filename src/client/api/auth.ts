import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AuthSessionResponse } from "../../shared/auth";
import { withBrowserClientHeaders } from "./clientHeaders";

export const authSessionKey = ["auth", "session"] as const;

function removeQueriesExceptAuthSession(qc: QueryClient): void {
  qc.removeQueries({
    predicate: (q) => {
      const k = q.queryKey;
      return !(k[0] === "auth" && k[1] === "session");
    },
  });
}

async function parseErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) {
        return body.error;
      }
    }
  } catch {
    // Fall through to text parsing.
  }
  const text = await response.text();
  return text.trim() || response.statusText || "Request failed";
}

async function authJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: withBrowserClientHeaders(init?.headers),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  return response.json() as Promise<T>;
}

export function useAuthSession() {
  return useQuery({
    queryKey: authSessionKey,
    queryFn: () => authJson<AuthSessionResponse>("/api/auth/session"),
    retry: false,
  });
}

export function useSetupAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { passphrase: string }) =>
      authJson<{ ok: true; recoveryKeyPrinted: boolean }>("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.setQueryData<AuthSessionResponse>(authSessionKey, {
        initialized: true,
        authenticated: false,
      });
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { passphrase: string }) =>
      authJson<AuthSessionResponse>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: (session) => {
      qc.setQueryData<AuthSessionResponse>(authSessionKey, session);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      authJson<AuthSessionResponse>("/api/auth/logout", {
        method: "POST",
      }),
    onSuccess: (session) => {
      // Set session first, then drop app cache. A full `clear()` evicts the auth query and
      // triggers a session refetch that can finish after `setQueryData` and restore stale
      // `authenticated: true`, so the UI stays on the shell until a full page reload.
      qc.setQueryData<AuthSessionResponse>(authSessionKey, session);
      removeQueriesExceptAuthSession(qc);
    },
  });
}

export function useRecoverPassphrase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { recoveryKey: string; passphrase: string }) =>
      authJson<{ ok: true }>("/api/auth/recover/reset-passphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.setQueryData<AuthSessionResponse>(authSessionKey, {
        initialized: true,
        authenticated: false,
      });
      removeQueriesExceptAuthSession(qc);
    },
  });
}
