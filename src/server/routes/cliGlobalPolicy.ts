import { Hono } from "hono";
import { requireWebSession, type AppBindings } from "../auth";
import { readCliGlobalPolicy, setCliGlobalCreateBoard } from "../storage/cliPolicy";

/** Web-only singleton: whether the CLI may create new boards (`cli_global_policy.create_board`). */
export const cliGlobalPolicyRoute = new Hono<AppBindings>();

cliGlobalPolicyRoute.get("/", (c) => {
  const blocked = requireWebSession(c);
  if (blocked) return blocked;
  return c.json(readCliGlobalPolicy());
});

cliGlobalPolicyRoute.patch("/", async (c) => {
  const blocked = requireWebSession(c);
  if (blocked) return blocked;
  let body: { createBoard?: unknown };
  try {
    body = (await c.req.json()) as { createBoard?: unknown };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (typeof body.createBoard !== "boolean") {
    return c.json({ error: "createBoard boolean required" }, 400);
  }
  setCliGlobalCreateBoard(body.createBoard);
  return c.json(readCliGlobalPolicy());
});
