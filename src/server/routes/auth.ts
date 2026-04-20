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
  SetupPassphraseError,
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
    return c.json(
      { error: "Passphrase required", code: "passphrase_required" },
      400,
    );
  }
  // The setup token (task #31338) travels in `Authorization: Bearer <token>`
  // rather than the JSON body so it never lands in browser dev-tools network
  // tabs alongside the passphrase by accident, and so the same `Bearer` shape
  // matches our existing CLI API key conventions.
  const setupToken =
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  try {
    await setupPassphrase({ passphrase: body.passphrase, setupToken });
  } catch (error) {
    if (error instanceof SetupPassphraseError) {
      switch (error.code) {
        case "auth_setup_token_required":
          return c.json(
            {
              error: error.message,
              code: error.code,
              hint: "Look for the boxed setup token printed in the terminal that started TaskManager.",
            },
            401,
          );
        case "auth_invalid_setup_token":
          return c.json({ error: error.message, code: error.code }, 401);
        case "auth_already_initialized":
          return c.json({ error: error.message, code: error.code }, 409);
        case "passphrase_required":
        default:
          return c.json({ error: error.message, code: error.code }, 400);
      }
    }
    const message = error instanceof Error ? error.message : "Setup failed";
    return c.json({ error: message, code: "setup_failed" }, 400);
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
