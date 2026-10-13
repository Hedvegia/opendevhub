import type { AiFinding, AiSeverity, OcrRunStats } from "../../shared/forgejo";
import type { OcrLimits, OcrProtocol } from "../../shared/ocr";
import { BODY_CHARS, MAX_FINDINGS } from "../integrations/ai-review";
import { IntegrationError } from "../integrations/settings";

/** Variables in an environment that would override the provider opendevhub passes. */
const UNSET =
  "ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL ANTHROPIC_API_KEY OCR_LLM_AUTH_HEADER OCR_LLM_EXTRA_HEADERS OCR_LLM_TIMEOUT OCR_USE_ANTHROPIC XDG_CONFIG_HOME";

/**
 * Reads the key from stdin, runs in an empty temporary HOME (removed on exit) so no OCR config or rc file in
 * the environment applies, and passes the provider through OCR's own variables. Positional args:
 * bin dir url protocol model, then the `ocr` arguments.
 */
const SCRIPT = `bin="$1"; dir="$2"; url="$3"; protocol="$4"; model="$5"; shift 5
OCR_LLM_TOKEN=""
IFS= read -r OCR_LLM_TOKEN || [ -n "$OCR_LLM_TOKEN" ] || { echo "no API key on stdin" >&2; exit 2; }
home=$(mktemp -d) || exit 1
trap 'rm -rf "$home"' EXIT
trap 'exit 143' HUP INT TERM
unset ${UNSET}
export HOME="$home" OCR_LLM_TOKEN OCR_LLM_URL="$url" OCR_LLM_PROTOCOL="$protocol" OCR_LLM_MODEL="$model"
cd "$dir" || exit 1
"$bin" "$@"`;

export interface OcrProviderArgs {
  url: string;
  protocol: OcrProtocol;
  model: string;
}

export interface OcrReviewRun {
  bin: string;
  directory: string;
  base?: string;
  head?: string;
  background: string;
  provider: OcrProviderArgs;
  limits: OcrLimits;
}

const BACKGROUND_CHARS = 12_000;

/** The `sh -c` command of a review; the key goes on stdin (`ocrStdin`), never in argv. */
export const ocrReviewCommand = (run: OcrReviewRun): string[] => [
  "sh",
  "-c",
  SCRIPT,
  "ocr-review",
  run.bin,
  run.directory,
  run.provider.url,
  run.provider.protocol,
  run.provider.model,
  "review",
  ...(run.base && run.head ? ["--from", run.base, "--to", run.head] : []),
  "--format",
  "json",
  "--audience",
  "human",
  "--concurrency",
  String(run.limits.concurrency),
  "--timeout",
  String(run.limits.fileTimeout),
  ...(run.limits.tokenBudget > 0
    ? ["--max-tokens-budget", String(run.limits.tokenBudget)]
    : []),
  "--background",
  run.background.slice(0, BACKGROUND_CHARS),
];

/** `ocr llm test` with the given provider, run on this machine in an empty temporary HOME. */
export const ocrTestCommand = (
  bin: string,
  directory: string,
  provider: OcrProviderArgs
): { cmd: string; args: string[] } => ({
  args: [
    "-c",
    SCRIPT,
    "ocr-test",
    bin,
    directory,
    provider.url,
    provider.protocol,
    provider.model,
    "llm",
    "test",
  ],
  cmd: "sh",
});

export const ocrStdin = (key: string): string => `${key}\n`;

const SEVERITY: Record<string, AiSeverity> = {
  critical: "blocker",
  high: "major",
  low: "nit",
  medium: "minor",
};

const CATEGORIES = new Set([
  "bug",
  "security",
  "performance",
  "maintainability",
  "test",
  "style",
  "documentation",
  "other",
]);

const SUGGESTION_CHARS = 20_000;

const positive = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined;

const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** One OCR comment as a finding on the new side; a comment without a line is about the pull request. */
export const ocrFinding = (raw: unknown): AiFinding | undefined => {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const c = raw as Record<string, unknown>;
  const body = text(c.content).trim();
  if (!body) {
    return undefined;
  }
  const category = text(c.category).trim().toLowerCase();
  const suggestion = text(c.suggestion_code);
  const existing = text(c.existing_code);
  const extra = {
    ...(category
      ? { category: CATEGORIES.has(category) ? category : "other" }
      : {}),
    ...(suggestion.trim()
      ? {
          suggestion: suggestion.slice(0, SUGGESTION_CHARS),
          ...(existing.trim()
            ? { existing: existing.slice(0, SUGGESTION_CHARS) }
            : {}),
        }
      : {}),
  };
  const severity = SEVERITY[text(c.severity).trim().toLowerCase()] ?? "minor";
  const file = text(c.path)
    .trim()
    .replace(/^[ab]\//u, "");
  const line = positive(c.end_line) ?? positive(c.start_line);
  const base = { body: body.slice(0, BODY_CHARS), severity, ...extra };
  if (!file || line === undefined) {
    return base;
  }
  const start = positive(c.start_line);
  return {
    ...base,
    file,
    line,
    side: "new",
    ...(start !== undefined && start < line ? { start } : {}),
  };
};

export class OcrRunError extends IntegrationError {
  constructor(message: string) {
    super(message, 502);
    this.name = "OcrRunError";
  }
}

const ANSI = /\u001B\[[0-?]*[ -/]*[@-~]/gu;
const NOISE = /update available|npm (?:i|install) -g|new version of/iu;

/** The CLI's error output for the user: no ANSI codes, no update notice, the last few lines. */
export const trimOcrError = (raw: string, lines = 8): string => {
  const kept = raw
    .replaceAll(ANSI, "")
    .split(/\r?\n/u)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !NOISE.test(l));
  return kept.slice(-lines).join("\n").slice(-2000);
};

/** The first JSON document in a stream, if any. */
const jsonDocument = (out: string): Record<string, unknown> | undefined => {
  const from = out.indexOf("{");
  const to = out.lastIndexOf("}");
  if (from === -1 || to <= from) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(out.slice(from, to + 1));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

/** Failure statuses; everything else that parses is a (possibly partial) result. */
const FAILED = new Set(["failed"]);

const count = (v: unknown): number => {
  if (Array.isArray(v)) {
    return v.length;
  }
  return typeof v === "number" ? v : 0;
};

const stats = (doc: Record<string, unknown>): OcrRunStats => {
  const summary = (doc.summary ?? {}) as Record<string, unknown>;
  const coverage = ((doc.manifest as Record<string, unknown> | undefined)
    ?.coverage ?? {}) as Record<string, unknown>;
  const warnings = Array.isArray(doc.warnings) ? doc.warnings : [];
  const subtaskErrors = warnings.filter((w) => {
    const type = (w as Record<string, unknown> | null)?.type;
    return type === "subtask_error" || type === "scan_subtask_error";
  }).length;
  return {
    filesReviewed:
      typeof summary.files_reviewed === "number" ? summary.files_reviewed : 0,
    filesSkipped: count(coverage.failed) || subtaskErrors,
    status: text(doc.status) || "success",
    inputTokens: count(summary.input_tokens),
    outputTokens: count(summary.output_tokens),
    totalTokens: count(summary.total_tokens),
  };
};

/** Turns an OCR run into a summary and findings, or throws with the CLI's error. */
export const parseOcrOutput = (
  stdout: string,
  stderr: string,
  exitCode: number
): { summary: string; findings: AiFinding[]; stats: OcrRunStats } => {
  const doc = jsonDocument(stdout);
  const status = doc ? text(doc.status) : "";
  if (!doc || exitCode !== 0 || FAILED.has(status)) {
    // On failure OCR prints its error, then an indented `{"status":"failed"}` usage record, on stderr.
    const record = stderr.search(/^\{\s*$/mu);
    const failed =
      record === -1 ? undefined : jsonDocument(stderr.slice(record));
    const message =
      trimOcrError(record === -1 ? stderr : stderr.slice(0, record)) ||
      (doc ? text(doc.message) : "") ||
      (failed
        ? `Open Code Review failed (${text(failed.status) || "failed"}).`
        : "") ||
      `Open Code Review exited with code ${exitCode} without a result.`;
    throw new OcrRunError(message);
  }
  const findings = (Array.isArray(doc.comments) ? doc.comments : [])
    .map(ocrFinding)
    .filter((f): f is AiFinding => !!f)
    .slice(0, MAX_FINDINGS);
  const run = stats(doc);
  const summary =
    text(doc.project_summary).trim() ||
    (run.status === "skipped"
      ? "Open Code Review found nothing to review."
      : "");
  return { findings, stats: run, summary: summary.slice(0, BODY_CHARS) };
};
