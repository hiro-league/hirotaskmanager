/**
 * Published Task Manager CLI docs (Mintlify).
 * Anchor convention matches MDX headings that wrap titles in backticks: spaces → hyphen (cli #3 / #12).
 */

export const HIROTM_CLI_DOCS_BASE =
  "https://docs.hiroleague.com/task-manager/cli";

/** Root `hirotm --help` footer: conceptual overview (no subcommand anchor). */
export const HIROTM_CLI_DOCS_OVERVIEW_URL = `${HIROTM_CLI_DOCS_BASE}/cli-overview`;

/**
 * Slug for MDX headings (backtick titles or plain section titles):
 * trim, lowercase, whitespace runs → `-` (matches Mintlify-style fragments).
 */
export function docsAnchorFromHeading(heading: string): string {
  return heading.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Page URL with no `#` fragment (intermediate Commander groups, intro pages). */
export function docsPageUrl(pageStem: string): string {
  return `${HIROTM_CLI_DOCS_BASE}/${pageStem}`;
}

/** Full URL: `task-manager/cli/<page>#<slug>` from heading text (often inner backtick text). */
export function docsUrl(pageStem: string, mdxHeading: string): string {
  return `${HIROTM_CLI_DOCS_BASE}/${pageStem}#${docsAnchorFromHeading(mdxHeading)}`;
}

/**
 * Standard Commander `addHelpText("after", …)` block: examples + one docs link.
 * Omit `mdxHeading` to link the page root (no hash).
 */
export function subcommandHelpExamplesText(options: {
  lines: string[];
  pageStem: string;
  /** MDX heading inner text or section title, e.g. `tasks list` or "Board Operations". */
  mdxHeading?: string;
}): string {
  const url =
    options.mdxHeading != null && options.mdxHeading.length > 0
      ? docsUrl(options.pageStem, options.mdxHeading)
      : docsPageUrl(options.pageStem);
  const body = options.lines.map((line) => `  ${line}`).join("\n");
  return `

Examples:
${body}

Docs: ${url}
`;
}
