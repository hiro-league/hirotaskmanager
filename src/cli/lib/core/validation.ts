import { CLI_ERR } from "../../types/errors";
import { CliError } from "../output/output";

/**
 * Rejects when a value option is set together with its matching "clear" flag.
 * Tuple order: value flag label, value, clear flag label, clear flag (truthy = clear requested).
 * Centralizes mutual-exclusivity checks for write commands (cli-architecture-review #11).
 */
export function assertMutuallyExclusive(
  pairs: ReadonlyArray<readonly [string, unknown, string, unknown]>,
): void {
  for (const [valueFlagLabel, value, clearFlagLabel, clear] of pairs) {
    if (value !== undefined && clear) {
      throw new CliError(
        `Cannot use ${valueFlagLabel} together with ${clearFlagLabel}`,
        2,
        { code: CLI_ERR.mutuallyExclusiveOptions },
      );
    }
  }
}
