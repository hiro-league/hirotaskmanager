import { Hono } from "hono";
import { listStatuses } from "../storage";

export const statusesRoute = new Hono();

statusesRoute.get("/", (c) => c.json(listStatuses()));
