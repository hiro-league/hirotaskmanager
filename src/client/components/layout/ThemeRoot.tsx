import type { ReactNode } from "react";
import { useEffect, useSyncExternalStore } from "react";
import { usePreferencesStore } from "@/store/preferences";
import type { ThemePreference } from "@/store/preferences";

function subscribeSystemDark(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useSystemDark() {
  return useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);
}

export function resolveDark(
  themePreference: ThemePreference,
  systemDark: boolean,
): boolean {
  if (themePreference === "dark") return true;
  if (themePreference === "light") return false;
  return systemDark;
}

export function ThemeRoot({ children }: { children: ReactNode }) {
  const themePreference = usePreferencesStore((s) => s.themePreference);
  const systemDark = useSystemDark();
  const dark = resolveDark(themePreference, systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return children;
}
