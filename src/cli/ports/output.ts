/**
 * Stdout shaping for single-document CLI success payloads (ndjson vs human).
 * Implemented by `adapters/node-output.ts` (delegates to `lib/output.ts`).
 * List/search/table output still lives in `lib/output` for now; only `printJson`
 * is injected through context (see docs/cli-architecture-review.md §15).
 */
export type OutputPort = {
  printJson: (data: unknown) => void;
};
