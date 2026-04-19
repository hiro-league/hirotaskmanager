
https://skills.sh/hiro-league/hirotaskmanager/hiro-task-manager-cli/security/socket

## Summary of the Socket Audit

Socket scanned your `hiro-task-manager-cli` skill on Apr 18, 2026 and flagged **1 MEDIUM alert** (Confidence 87%, Severity 72%) on `SKILL.md`. The verdict was `SUSPICIOUS` (not malicious). The reviewer explicitly says:

> "the skill's purpose is coherent with its capabilities, and there is no clear credential theft or exfiltration behavior."

So the skill itself is not flagged as malware. The two concerns are:

1. **Supply‑chain trust** — the skill drives an external CLI (`hirotm`) but doesn't include verifiable install provenance (no checksum, no signed install instructions, no pinned source).
2. **Operational risk** — the skill describes destructive task/server operations (delete, purge, server start/stop) without the audit being able to see the safety guardrails.

Both points are **fair, but largely cosmetic** given how your skill is actually structured. Here is my assessment.

---

## What Socket got right

### 1. Install provenance is thin

In `SKILL.md` line 42 you have:

```40:42:C:\Users\augr\.agents\skills\hiro-task-manager-cli\SKILL.md
## Installation

If command is not found, ask the user to [install](https://docs.hiroleague.com/task-manager/get-started/quick-start) it and configure it.
```

From a supply‑chain auditor's perspective, this is a single opaque link. There is:
- No mention of the publisher/owner (Hiro League).
- No package name (e.g. npm `@hiroleague/task-manager` or pip `hirotaskmanager`).
- No version pin or checksum.
- No statement that the agent must NOT auto-install.

Socket's automated graders are trained to flag exactly this pattern because a malicious skill could redirect users to a compromised installer.

### 2. Destructive operations are described

Lines 16, 33, 65–69, 91 all reference delete / purge / restore / server start-stop. These are correctly called out as "sensitive" in your skill, but the auditor only sees the *capabilities*, not the runtime guardrails enforced by `hirotm` itself (CLI access policy, `--client-name` attribution, trash + restore semantics).

---

## What Socket got wrong / is overstated

The MEDIUM severity is harsher than warranted because the audit didn't credit several mitigations that ARE in the skill:

| Mitigation | Where it appears |
|---|---|
| Inspect-first, smallest-safe-mutation workflow | `SKILL.md` lines 18–26, 89 |
| Mandatory agent attribution via `--client-name` | lines 32, 35–38 |
| Explicit "do not bypass CLI access control" rule | lines 61–63, 92 |
| "Do not purge unless intent is clearly explicit" | line 91 |
| Reference to a documented [CLI Access Policy](reference/cli-access-policy.md) | line 82 |
| Workspace `AGENTS.md` lists operator-only commands the agent must NOT run (api-key generate/list/revoke, profile use, interactive setup) | `d:\projects\hirotaskmanager\AGENTS.md` |

So the destructive‑operations risk is already mitigated by design. The audit just can't see your repo‑level `AGENTS.md`.

Also worth noting: Socket scored **Severity 72%** but the description is consistent with LOW/MEDIUM, not HIGH. The numeric severity seems inflated by the boilerplate "destructive operations" pattern more than by anything specific in your skill.

---

## Concrete improvements that would clear (or downgrade) the alert

These are low‑effort changes to `SKILL.md` that directly address the two flagged concerns:

### A. Strengthen the Installation section (fixes "unverifiable install provenance")

Replace the one-liner with something like:

```markdown
## Installation

`hirotm` is the official CLI of **Hiro Task Manager** by Hiro League
(source: https://github.com/hiroleague/hirotaskmanager).

- Do **not** auto-install. If `hirotm` is not on PATH, stop and ask the
  user to install it manually following the official guide:
  https://docs.hiroleague.com/task-manager/get-started/quick-start
- Verify installation with `hirotm --version` before any other command.
- Never download or execute install scripts from untrusted mirrors.
```

This single block addresses publisher identity, source repo, "no auto-install", and verification — the four things supply‑chain scanners look for.

### B. Make the destructive‑operation guardrails louder (fixes "operational risk")

Add an explicit "Destructive operations" section near the top, e.g.:

```markdown
## Destructive operations (require explicit user intent)

The following are NEVER to be invoked without an explicit, unambiguous
user request in the current turn:

- `tasks purge`, `lists purge`, `boards purge`
- `server stop`
- Any command in the operator-only list in the repo's `AGENTS.md`
  (e.g. `server api-key generate|list|revoke`, `profile use`, the
  interactive `hirotaskmanager` wizard).

Soft-deletes (`delete`) are allowed only after the agent has shown the
target entity to the user and confirmed it is the right one. Prefer
`trash` inspection and `restore` over re-creation.
```

You essentially have all of this scattered across the file — concentrating it in one named section is what an auditor (and another LLM) will recognize.

### C. Add a short "What this skill will not do" section

Auditors and LLMs both reward a negative-capability list. Two or three lines:

```markdown
## Out of scope

- Installing, updating, or uninstalling `hirotm`.
- Generating, reading, or rotating API keys.
- Changing the system-wide default profile.
- Acting on entities the user has not been shown.
```

### D. Tiny wording fixes worth making while you're in there

- Line 8 duplicates the YAML `description`. Fine, but redundant.
- Line 14 "listing" → "Listing" (capitalization).
- Line 24 trailing comma after "data," should be a period.
- Line 53 "manage and the output shape" reads oddly — probably "manage the output shape".
- "filers" on line 52 → "filters".

None of these affect security, but a cleaner SKILL.md gives auditors fewer reasons to mark things "suspicious" by association.

---

## Should you actually worry?

Short answer: **no, but fix it anyway.**

- Severity is MEDIUM, not HIGH/CRITICAL.
- The verdict is `SUSPICIOUS`, not `MALICIOUS`.
- The flagged behavior (driving an external CLI that can delete things) is the *whole point* of the skill — you can't remove it, you can only document it better.
- The fixes above are pure documentation and will likely move the alert to LOW or clear it on the next scan, while also making the skill safer for end users and other agents that read it.

If you'd like, switch me to Agent mode and I can apply the `SKILL.md` edits (Installation hardening, explicit destructive-ops section, out-of-scope list, and the small typo fixes) in one pass.