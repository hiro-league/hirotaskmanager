import { Hono } from "hono";
import type { AppBindings } from "../auth";
import { listStatuses } from "../storage";

export const statusesRoute = new Hono<AppBindings>();

statusesRoute.get("/", (c) => c.json(listStatuses()));
