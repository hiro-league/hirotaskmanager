import { startTaskManagerServer } from "./index";
import { parseBootstrapProfileFromArgv } from "./parseBootstrapProfile";

await startTaskManagerServer({
  kind: "installed",
  profile: parseBootstrapProfileFromArgv(),
});
