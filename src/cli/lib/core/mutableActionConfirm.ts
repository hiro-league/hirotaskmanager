import { createInterface } from "node:readline/promises";
import { CLI_ERR } from "../../types/errors";
import { CliError } from "../output/output";
import { canPromptInteractively } from "./tty";
import type { ConfirmMutableActionArgs } from "../../types/options";

/**
 * Destructive / high-impact `hirotm` mutations require explicit consent: interactive
 * prompt on a TTY, or `--yes` when stdin/stdout are not both TTY (scripts, CI, agents).
 */

function writeImpactToStderr(lines: readonly string[]): void {
  process.stderr.write(`${lines.join("\n")}\n\n`);
}

async function promptYesNoDefaultNo(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    for (;;) {
      const answer = (await rl.question("Proceed? [y/N]: "))
        .trim()
        .toLowerCase();
      if (!answer) return false;
      if (answer === "y" || answer === "yes") return true;
      if (answer === "n" || answer === "no") return false;
      process.stderr.write("Please answer yes or no.\n");
    }
  } finally {
    rl.close();
  }
}

export type { ConfirmMutableActionArgs } from "../../types/options";

/**
 * Unless `yes` is true: print `impactLines` to stderr, then either prompt on a TTY
 * or throw with exit 2 and `confirmation_required`.
 */
export async function confirmMutableAction(
  args: ConfirmMutableActionArgs,
): Promise<void> {
  if (args.yes) {
    return;
  }

  writeImpactToStderr(args.impactLines);

  if (args.stdinReservedForPayload) {
    throw new CliError(
      "This command reads JSON from stdin (--stdin): pass --yes (-y) after reviewing the impact above; interactive confirm cannot share stdin with the payload.",
      2,
      {
        code: CLI_ERR.confirmationRequired,
        retryable: false,
        hint: "Re-run with -y or --yes (stdin stays available for JSON only).",
      },
    );
  }

  if (!canPromptInteractively()) {
    throw new CliError(
      "This operation requires confirmation: use an interactive terminal, or pass --yes (-y) after reviewing the impact above.",
      2,
      {
        code: CLI_ERR.confirmationRequired,
        retryable: false,
        hint: "Re-run the same command with -y or --yes.",
      },
    );
  }

  const ok = await promptYesNoDefaultNo();
  if (!ok) {
    throw new CliError("Aborted.", 1, {
      code: CLI_ERR.confirmationDeclined,
      retryable: false,
    });
  }
}
