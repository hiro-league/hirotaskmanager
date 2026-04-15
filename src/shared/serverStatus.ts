import type { RuntimeKind } from "./runtimeConfig";
import type { RuntimeSource } from "./runtimeIdentity";

export interface RunningServerStatus {
  pid: number;
  port: number;
  running: true;
  runtime: RuntimeKind;
  source: RuntimeSource;
  url: string;
}

export interface StoppedServerStatus {
  running: false;
}

export type ServerStatus = RunningServerStatus | StoppedServerStatus;

export function buildLocalServerUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}
