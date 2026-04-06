export const AUTH_SESSION_COOKIE_NAME = "taskmanager_session";

export type AuthPrincipalType = "web" | "cli" | "system";

export interface AuthSessionResponse {
  initialized: boolean;
  authenticated: boolean;
}
