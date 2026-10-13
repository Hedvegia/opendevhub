import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BODY_CHARS } from "../../../src/server/integrations/ai-review";
import { spawnRunner } from "../../../src/server/nodes/exec";
import {
  OcrRunError,
  ocrFinding,
  ocrReviewCommand,
  ocrStdin,
  ocrTestCommand,
  parseOcrOutput,
  trimOcrError,
} from "../../../src/server/ocr/review";
import { OCR_DEFAULT_LIMITS } from "../../../src/shared/ocr";

const fixture = (name: string): string =>
  fs.readFileSync(
    path.join(import.meta.dirname, "../../fixtures/ocr", name),
    "utf-8"
  );

const KEY = "sk-secret-123";
const provider = {
  model: "vllm/coding",
  protocol: "openai" as const,
  url: "https://ask-ai.example.com/api",
};

describe("ocrReviewCommand", () => {
  const run = {
    background: "Fix it\n\nFixes the thing",
    base: "origin/main",
    bin: "/tmp/.opendevhub/ocr/1.12.13/ocr",
    directory: "/workspaces/repo",
    head: "abc123",
    limits: OCR_DEFAULT_LIMITS,
    provider,
  };

  it("runs review on base…head with the limits, in an isolated HOME", () => {
    const cmd = ocrReviewCommand({
      ...run,
      limits: { ...OCR_DEFAULT_LIMITS, concurrency: 2, fileTimeout: 5 },
    });
    expect(cmd.slice(0, 2)).toStrictEqual(["sh", "-c"]);
    const script = cmd[2];
    expect(script).toContain("home=$(mktemp -d)");
    expect(script).toContain("trap 'rm -rf \"$home\"' EXIT");
    expect(script).toContain("read -r OCR_LLM_TOKEN");
    expect(script).toContain(
      "unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_MODEL"
    );
    expect(cmd.slice(3)).toStrictEqual([
      "ocr-review",
      run.bin,
      run.directory,
      provider.url,
      "openai",
      "vllm/coding",
      "review",
      "--from",
      "origin/main",
      "--to",
      "abc123",
      "--format",
      "json",
      "--audience",
      "human",
      "--concurrency",
      "2",
      "--timeout",
      "5",
      "--background",
      "Fix it\n\nFixes the thing",
    ]);
  });

  it("passes a token budget only when one is set", () => {
    const cmd = ocrReviewCommand({
      ...run,
      limits: { ...OCR_DEFAULT_LIMITS, tokenBudget: 50_000 },
    });
    expect(cmd).toContain("--max-tokens-budget");
    expect(cmd[cmd.indexOf("--max-tokens-budget") + 1]).toBe("50000");
  });

  it("uses workspace mode for uncommitted changes", () => {
    const cmd = ocrReviewCommand({ ...run, base: undefined, head: undefined });
    expect(cmd).not.toContain("--from");
    expect(cmd).not.toContain("--to");
    expect(cmd).toContain("review");
  });

  it("never puts the key in argv: it goes on stdin", () => {
    expect(ocrReviewCommand(run).join(" ")).not.toContain(KEY);
    const test = ocrTestCommand(run.bin, "/tmp", provider);
    expect([test.cmd, ...test.args].join(" ")).not.toContain(KEY);
    expect(test.args.slice(-2)).toStrictEqual(["llm", "test"]);
    expect(ocrStdin(KEY)).toBe(`${KEY}\n`);
  });
});

describe("the review script", () => {
  it("runs the binary in an empty, removed HOME with the key from stdin and no overriding variables", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odh-ocr-script-"));
    try {
      const bin = path.join(dir, "fake-ocr");
      fs.writeFileSync(
        bin,
        '#!/bin/sh\necho "home=$HOME files=$(ls -A "$HOME" | wc -l) pwd=$(pwd)"\necho "token=$OCR_LLM_TOKEN url=$OCR_LLM_URL model=$OCR_LLM_MODEL protocol=$OCR_LLM_PROTOCOL"\necho "anthropic=${ANTHROPIC_BASE_URL:-unset} args=$*"\n',
        { mode: 0o755 }
      );
      const { cmd, args } = ocrTestCommand(bin, dir, provider);
      const r = await spawnRunner(cmd, args, {
        env: { ANTHROPIC_BASE_URL: "https://elsewhere.example" },
        input: ocrStdin(KEY),
      });
      expect(r.exitCode).toBe(0);
      const home = /home=(?<h>\S+)/u.exec(r.stdout)?.groups?.h ?? "";
      expect(r.stdout).toContain("files=0");
      expect(r.stdout).toContain(`pwd=${fs.realpathSync(dir)}`);
      expect(r.stdout).toContain(
        `token=${KEY} url=${provider.url} model=vllm/coding protocol=openai`
      );
      expect(r.stdout).toContain("anthropic=unset args=llm test");
      expect(home).not.toBe(os.homedir());
      expect(fs.existsSync(home)).toBe(false);
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });
});

describe("ocrFinding", () => {
  it("maps a line comment onto the new side with severity, category and suggestion", () => {
    expect(
      ocrFinding({
        category: "bug",
        content: "Off by one",
        end_line: 42,
        existing_code: "a",
        path: "src/a.ts",
        severity: "high",
        start_line: 40,
        suggestion_code: "b",
      })
    ).toStrictEqual({
      body: "Off by one",
      category: "bug",
      existing: "a",
      file: "src/a.ts",
      line: 42,
      severity: "major",
      side: "new",
      start: 40,
      suggestion: "b",
    });
  });

  it("maps every severity, and anything else to minor", () => {
    const severity = (s?: string) =>
      ocrFinding({ content: "x", severity: s })?.severity;
    expect(
      ["critical", "high", "medium", "low", "urgent", undefined].map(severity)
    ).toStrictEqual(["blocker", "major", "minor", "nit", "minor", "minor"]);
  });

  it("makes a comment without a positive line a general finding", () => {
    expect(
      ocrFinding({
        content: "Docs",
        end_line: 0,
        path: "README.md",
        start_line: 0,
      })
    ).toStrictEqual({ body: "Docs", severity: "minor" });
  });

  it("drops empty comments, keeps single lines without a start, and cuts long bodies", () => {
    expect(
      ocrFinding({ content: "  ", path: "a.ts", end_line: 3 })
    ).toBeUndefined();
    expect(ocrFinding(null)).toBeUndefined();
    expect(
      ocrFinding({ content: "x", end_line: 3, path: "a.ts", start_line: 3 })
    ).not.toHaveProperty("start");
    expect(
      ocrFinding({ content: "y".repeat(BODY_CHARS + 10) })?.body
    ).toHaveLength(BODY_CHARS);
  });
});

describe("parseOcrOutput", () => {
  it("reads comments, the project summary and the files skipped", () => {
    const out = parseOcrOutput(fixture("comments.json"), "", 0);
    expect(out.summary).toBe(
      "Adds a totals helper and token checks; one off-by-one and a timing leak."
    );
    expect(out.stats).toStrictEqual({
      filesReviewed: 3,
      filesSkipped: 1,
      status: "partial",
      inputTokens: 45_002,
      outputTokens: 3209,
      totalTokens: 48_211,
    });
    expect(
      out.findings.map((f) => [f.file, f.start, f.line, f.severity, f.category])
    ).toStrictEqual([
      ["src/a.ts", 40, 42, "major", "bug"],
      ["src/auth/token.ts", undefined, 17, "blocker", "security"],
      [undefined, undefined, undefined, "nit", "documentation"],
    ]);
    expect(out.findings[0].suggestion).toContain("i < items.length");
  });

  it("reads a run without comments", () => {
    const out = parseOcrOutput(fixture("no-comments.json"), "", 0);
    expect(out).toStrictEqual({
      findings: [],
      stats: {
        filesReviewed: 2,
        filesSkipped: 0,
        status: "success",
        inputTokens: 8800,
        outputTokens: 320,
        totalTokens: 9120,
      },
      summary: "Renames a helper; no issues found.",
    });
  });

  it("says when there was nothing to review", () => {
    const out = parseOcrOutput(fixture("skipped.json"), "", 0);
    expect(out.stats.status).toBe("skipped");
    expect(out.findings).toStrictEqual([]);
    expect(out.summary).toBe("Open Code Review found nothing to review.");
  });

  it("reports a failed run with the CLI's error line", () => {
    expect(() => parseOcrOutput("", fixture("failed.stderr"), 1)).toThrow(
      OcrRunError
    );
    expect(() => parseOcrOutput("", fixture("failed.stderr"), 1)).toThrow(
      /401 Unauthorized.*Incorrect API key/u
    );
  });

  it("fails on output that isn't JSON", () => {
    expect(() => parseOcrOutput("{not json", "", 0)).toThrow(
      /exited with code 0 without a result/u
    );
    expect(() => parseOcrOutput('{"status":"failed"}', "", 0)).toThrow(
      OcrRunError
    );
  });

  it("strips ANSI codes and the update notice, keeping the last lines", () => {
    const raw = [
      "\u001B[33mUpdate available: 1.12.14\u001B[0m run npm i -g @alibaba-group/open-code-review",
      ...Array.from({ length: 12 }, (_, i) => `\u001B[31mline ${i}\u001B[0m`),
    ].join("\n");
    const trimmed = trimOcrError(raw);
    expect(trimmed).not.toMatch(/Update available|\u001B/u);
    expect(trimmed.split("\n")).toHaveLength(8);
    expect(trimmed.split("\n").at(-1)).toBe("line 11");
  });
});
