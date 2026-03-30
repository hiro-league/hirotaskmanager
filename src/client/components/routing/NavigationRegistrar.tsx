import { useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { registerAppNavigate } from "@/lib/appNavigate";

/** Registers `appNavigate` for use outside React (e.g. TanStack Query mutations). */
export function NavigationRegistrar() {
  const navigate = useNavigate();
  useLayoutEffect(() => {
    registerAppNavigate(navigate);
    return () => registerAppNavigate(null);
  }, [navigate]);
  return null;
}
