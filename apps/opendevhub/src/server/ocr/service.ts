import os from "node:os";

import type {
  AiFinding,
  ForgejoPullDetails,
  OcrRunStats,
} from "../../shared/forgejo";
import type { OcrTestInput, OcrTestResult } from "../../shared/ocr";
import type { ToolEnv } from "../git/checkouts";
import { parseRemote } from "../git/forge";
import { InvalidRequestError, validateBranch } from "../git/worktrees";
import type { Runner } from "../nodes/exec";
import { ensureInEnv, hostPlatform } from "./binary";
import type { OcrBinaries } from "./binary";
import {
  OcrRunError,
  ocrReviewCommand,
  ocrStdin,
  ocrTestCommand,
  parseOcrOutput,
  trimOcrError,
} from "./review";
import { OcrSettingsError } from "./settings";
import type { OcrSettingsStore } from "./settings";

const GIT_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 2 * 60_000;
/** Leaves OCR time to print its result after its own per-file timeouts. */
const MINUTE_MS = 60_000;

export interface OcrServiceDeps {
  settings: OcrSettingsStore;
  binaries: Pick<OcrBinaries, "ensureBinary">;
  /** A running checkout's container; throws for unknown or stopped ones. */
  toolEnv: (projectId: string, directory: string) => ToolEnv;
  /** Runs on this machine, for `ocr llm test`. */
  run: Runner;
}

export interface OcrReviewRequest {
  projectId: string;
  directory: string;
  details: ForgejoPullDetails;
}

/** The pull request's base repository as `host` and `owner/repo`, from its web URL. */
const baseRepo = (details: ForgejoPullDetails) => {
  const url = new URL(details.pull.url);
  return {
    host: url.hostname,
    path: `${details.pull.owner}/${details.pull.repo}`.toLowerCase(),
  };
};

/** Runs Open Code Review: installs the bundled binary in a checkout's environment, reviews, tests connections. */
export class OcrService {
  private readonly deps: OcrServiceDeps;
  constructor(deps: OcrServiceDeps) {
    this.deps = deps;
  }

  /** Makes sure the checkout's environment has the binary; `installed` is false when it already had it. */
  async install(
    projectId: string,
    directory: string
  ): Promise<{ installed: boolean }> {
    const env = this.deps.toolEnv(projectId, directory);
    let installed = false;
    await ensureInEnv(this.deps.binaries, env, () => {
      installed = true;
    });
    return { installed };
  }

  /** The remote of the pull request's base repository in the checkout, else `origin`. */
  private async baseRemote(
    env: ToolEnv,
    directory: string,
    details: ForgejoPullDetails
  ): Promise<string> {
    const r = await env.exec(["git", "-C", directory, "remote", "-v"], {
      timeoutMs: GIT_TIMEOUT_MS,
    });
    const want = baseRepo(details);
    for (const line of r.stdout.split("\n")) {
      const [name, url] = line.trim().split(/\s+/u);
      const info = url ? parseRemote(url) : undefined;
      if (
        name &&
        info?.host === want.host &&
        info.path.toLowerCase() === want.path
      ) {
        return name;
      }
    }
    return "origin";
  }

  async review(
    req: OcrReviewRequest
  ): Promise<{ summary: string; findings: AiFinding[]; stats: OcrRunStats }> {
    const { projectId, directory, details } = req;
    const provider = await this.deps.settings.resolve(projectId);
    if (!provider) {
      throw new OcrSettingsError("Set up Open Code Review in Settings.", 412);
    }
    const env = this.deps.toolEnv(projectId, directory);
    const head = await env.exec(
      ["git", "-C", directory, "rev-parse", "--verify", "-q", "HEAD"],
      { timeoutMs: GIT_TIMEOUT_MS }
    );
    if (head.stdout.trim() !== details.headSha) {
      throw new InvalidRequestError(
        "This checkout is not at the pull request's head commit. Update the checkout first."
      );
    }
    const base = validateBranch(details.base);
    const remote = await this.baseRemote(env, directory, details);
    const fetched = await env.exec(
      [
        "git",
        "-C",
        directory,
        "fetch",
        "--no-tags",
        "--quiet",
        "--",
        remote,
        `+refs/heads/${base}:refs/remotes/${remote}/${base}`,
      ],
      { env: { GIT_TERMINAL_PROMPT: "0" }, timeoutMs: GIT_TIMEOUT_MS }
    );
    if (fetched.exitCode !== 0) {
      throw new OcrRunError(
        `Could not fetch ${base} from ${remote}: ${trimOcrError(fetched.stderr, 3)}`
      );
    }
    const bin = await ensureInEnv(this.deps.binaries, env);
    const limits = this.deps.settings.limits();
    const result = await env.exec(
      ocrReviewCommand({
        background: `${details.pull.title}\n\n${details.body}`.trim(),
        base: `${remote}/${base}`,
        bin,
        directory,
        head: details.headSha,
        limits,
        provider,
      }),
      {
        input: ocrStdin(provider.key),
        timeoutMs: limits.runLimit * MINUTE_MS,
      }
    );
    if (result.timedOut) {
      throw new OcrRunError(
        `Open Code Review was stopped at the run limit of ${limits.runLimit} minutes.`
      );
    }
    return parseOcrOutput(result.stdout, result.stderr, result.exitCode);
  }

  /** `ocr llm test` on this machine with the form's values. */
  async test(input: OcrTestInput): Promise<OcrTestResult> {
    const values = await this.deps.settings.testValues(
      input.provider,
      input.projectId
    );
    const bin = await this.deps.binaries.ensureBinary(hostPlatform());
    const { cmd, args } = ocrTestCommand(bin, os.tmpdir(), values);
    const r = await this.deps.run(cmd, args, {
      input: ocrStdin(values.key),
      timeoutMs: TEST_TIMEOUT_MS,
    });
    if (r.exitCode === 0 && !r.timedOut) {
      return { ok: true };
    }
    const error = trimOcrError(
      `${r.stderr}\n${r.stdout}`.replaceAll(values.key, "[redacted]")
    );
    return {
      error: r.timedOut
        ? "The connection test timed out."
        : error || `ocr llm test exited with code ${r.exitCode}.`,
      ok: false,
    };
  }
}
