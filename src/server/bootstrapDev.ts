import { startTaskManagerServer } from "./index";
import {
  parseBootstrapPortFromArgv,
  parseBootstrapProfileFromArgv,
} from "./parseBootstrapProfile";

await startTaskManagerServer({
  kind: "dev",
  profile: parseBootstrapProfileFromArgv() ?? "dev",
  port: parseBootstrapPortFromArgv(),
});
