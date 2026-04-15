import { startTaskManagerServer } from "./index";
import {
  parseBootstrapDevFlagFromArgv,
  parseBootstrapPortFromArgv,
  parseBootstrapProfileFromArgv,
} from "./parseBootstrapProfile";

// --dev flag explicitly sets dev runtime; without it, defaults to installed.
const isDev = parseBootstrapDevFlagFromArgv();

await startTaskManagerServer({
  kind: isDev ? "dev" : "installed",
  profile: parseBootstrapProfileFromArgv(),
  port: parseBootstrapPortFromArgv(),
});
