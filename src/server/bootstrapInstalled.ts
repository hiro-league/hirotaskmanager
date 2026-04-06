import { startTaskManagerServer } from "./index";

await startTaskManagerServer({
  kind: "installed",
  profile: process.env.TASKMANAGER_PROFILE?.trim() || undefined,
});
