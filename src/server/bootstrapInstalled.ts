import { startTaskManagerServer } from "./index";
import {
  parseBootstrapPortFromArgv,
  parseBootstrapProfileFromArgv,
} from "./parseBootstrapProfile";

await startTaskManagerServer({
  kind: "installed",
  profile: parseBootstrapProfileFromArgv(),
  port: parseBootstrapPortFromArgv(),
});
