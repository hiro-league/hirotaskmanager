import type { ProfileRole } from "../../../shared/runtimeConfig";
import type { ServerStatus } from "../../types/config";

export type FlatServerStatusProfile = {
  profile: string;
  role: ProfileRole;
  api_url: string;
};

export type FlatServerStatus = {
  kind: "server_status";
  profile: string;
  role: ProfileRole;
  running: boolean;
  reachable: boolean;
  api_url: string;
  server_pid?: number;
  server_port?: number;
  server_runtime?: "dev" | "installed";
  server_source?: "repo" | "installed";
  server_reported_url?: string;
};

export function buildFlatServerStatus(
  status: ServerStatus,
  profile: FlatServerStatusProfile,
): FlatServerStatus {
  const base = {
    kind: "server_status" as const,
    profile: profile.profile,
    role: profile.role,
    running: status.running,
    reachable: status.running,
    api_url: profile.api_url,
  };

  if (!status.running) return base;

  return {
    ...base,
    server_pid: status.pid,
    server_port: status.port,
    server_runtime: status.runtime,
    server_source: status.source,
    server_reported_url: status.url,
  };
}
