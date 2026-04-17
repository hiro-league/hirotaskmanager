import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { fetchStatuses } from "./api/queries";
import { ThemeRoot } from "@/components/layout/ThemeRoot";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

// Warm statuses cache early so board columns rarely wait on a second fetch (Priority 3).
void queryClient.prefetchQuery({
  queryKey: ["statuses"],
  queryFn: fetchStatuses,
  staleTime: 1000 * 60 * 60,
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeRoot>
        <App />
      </ThemeRoot>
    </QueryClientProvider>
  </StrictMode>,
);
