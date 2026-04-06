import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CliGlobalPolicy } from "../../shared/cliPolicy";
import { fetchJson } from "./queries";

export const cliGlobalPolicyKeys = {
  all: ["cliGlobalPolicy"] as const,
};

export function useCliGlobalPolicy() {
  return useQuery({
    queryKey: cliGlobalPolicyKeys.all,
    queryFn: () => fetchJson<CliGlobalPolicy>("/api/cli-global-policy"),
  });
}

export function usePatchCliGlobalPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { createBoard: boolean }) =>
      fetchJson<CliGlobalPolicy>("/api/cli-global-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createBoard: input.createBoard }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(cliGlobalPolicyKeys.all, data);
    },
  });
}
