import { startTaskManagerServer } from "./index";

await startTaskManagerServer({
  kind: "dev",
  profile: process.env.TASKMANAGER_PROFILE?.trim() || "dev",
});
