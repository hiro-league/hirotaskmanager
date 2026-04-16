let runtimeClientName = "hirotm";
let runtimeClientInstanceId: string | null = null;

function generateClientInstanceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `hirotm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function setRuntimeCliClientName(name: string | undefined): void {
  const trimmed = typeof name === "string" ? name.trim() : "";
  runtimeClientName = trimmed.length > 0 ? trimmed : "hirotm";
}

export function getRuntimeCliClientName(): string {
  return runtimeClientName;
}

export function getRuntimeCliClientInstanceId(): string {
  if (!runtimeClientInstanceId) {
    runtimeClientInstanceId = generateClientInstanceId();
  }
  return runtimeClientInstanceId;
}
