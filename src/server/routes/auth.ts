import { Hono } from "hono";
import type { AuthSessionResponse } from "../../shared/auth";
import {
  clearActiveSession,
  clearAuthSessionCookie,
  getAuthSessionResponse,
  loginWithPassphrase,
  requireWebSession,
  resetPassphraseWithRecoveryKey,
  setAuthSessionCookie,
  setupPassphrase,
} from "../auth";
import type { AppBindings } from "../auth";

export const authRoute = new Hono<AppBindings>();

authRoute.get("/session", async (c) => {
  const session = await getAuthSessionResponse(c);
  return c.json<AuthSessionResponse>(session);
});

authRoute.post("/setup", async (c) => {
  let body: { passphrase?: unknown };
  try {
    body = (await c.req.json()) as { passphrase?: unknown };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof body.passphrase !== "string" || body.passphrase.length === 0) {
    return c.json({ error: "Passphrase required" }, 400);
  }
  try {
    await setupPassphrase(body.passphrase);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup failed";
    const status = message === "Auth already initialized" ? 409 : 400;
    return c.json({ error: message }, status);
  }
  return c.json({ ok: true, recoveryKeyPrinted: true }, 201);
});

authRoute.post("/login", async (c) => {
  const session = await getAuthSessionResponse(c);
  if (!session.initialized) {
    return c.json({ error: "TaskManager setup required" }, 409);
  }
  let body: { passphrase?: unknown };
  try {
    body = (await c.req.json()) as { passphrase?: unknown };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof body.passphrase !== "string" || body.passphrase.length === 0) {
    return c.json({ error: "Passphrase required" }, 400);
  }
  const sessionToken = await loginWithPassphrase(body.passphrase);
  if (!sessionToken) {
    return c.json({ error: "Invalid passphrase" }, 401);
  }
  setAuthSessionCookie(c, sessionToken);
  return c.json<AuthSessionResponse>({ initialized: true, authenticated: true });
});

authRoute.post("/logout", async (c) => {
  const blocked = requireWebSession(c);
  if (blocked) return blocked;
  await clearActiveSession();
  clearAuthSessionCookie(c);
  return c.json<AuthSessionResponse>({ initialized: true, authenticated: false });
});

authRoute.post("/recover/reset-passphrase", async (c) => {
  const session = await getAuthSessionResponse(c);
  if (!session.initialized) {
    return c.json({ error: "TaskManager setup required" }, 409);
  }
  let body: { recoveryKey?: unknown; passphrase?: unknown };
  try {
    body = (await c.req.json()) as { recoveryKey?: unknown; passphrase?: unknown };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof body.recoveryKey !== "string" || body.recoveryKey.length === 0) {
    return c.json({ error: "Recovery key required" }, 400);
  }
  if (typeof body.passphrase !== "string" || body.passphrase.length === 0) {
    return c.json({ error: "Passphrase required" }, 400);
  }
  try {
    const ok = await resetPassphraseWithRecoveryKey(body.recoveryKey, body.passphrase);
    if (!ok) {
      return c.json({ error: "Invalid recovery key" }, 401);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recovery failed";
    return c.json({ error: message }, 400);
  }
  clearAuthSessionCookie(c);
  return c.json({ ok: true });
});
