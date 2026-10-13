import { Alert, AlertDescription } from "@opendevhub/ui/alert";
import { Button } from "@opendevhub/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@opendevhub/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@opendevhub/ui/dropdown-menu";
import { Input } from "@opendevhub/ui/input";
import { Label } from "@opendevhub/ui/label";
import { Textarea } from "@opendevhub/ui/textarea";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  BotIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  ScanSearchIcon,
  SparklesIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";

import { confirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";

import type {
  AiSeverity,
  ForgejoComment,
  ForgejoPullDetails,
  OcrRunStats,
} from "../../../shared/forgejo";
import type { OcrSettings } from "../../../shared/ocr";
import type {
  ProjectView,
  SessionSummary,
  StoredAiReview,
} from "../../../shared/types";
import {
  collectAiReview,
  createForgejoWorktree,
  fetchProjectOcr,
  fetchOcrLog,
  installOcr,
  runOcrReview,
  startAiReviewSession,
} from "../../api";
import { Choice } from "../../components/choice";
import { MarkdownBody } from "../../components/markdown-body";
import { Chip, Note } from "../../components/page";
import { useDash } from "../../dashboard-context";
import { Link, useNavigate } from "../../routing";
import {
  checkoutOf,
  checkoutRuntime,
  checkouts,
  sessionPath,
} from "../checkouts/checkouts";
import { ProjectSettingsDialog } from "../projects/project-settings-dialog";
import { linesLabel, newId } from "../review/review";
import type { DiffNote } from "../review/review";
import {
  OCR_SECTION,
  projectOcrKey,
  useOcrSettings,
  useProjectOcr,
} from "../settings/ocr-settings";
import { SettingsLink, useSettingsHref } from "../settings/settings-link";
import { readAiRun, saveAiRun } from "./forgejo";
import type { AiReviewRun, AiSuggestion } from "./forgejo";
import { RequestState } from "./forgejo-context";
import { useForgejoCheckouts } from "./use-forgejo-checkouts";

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/** A session that never shows as busy is taken as done after this long. */
const IDLE_GRACE_MS = 20_000;
/** A review session missing from the snapshot for this long was deleted. */
const GONE_MS = 30_000;
/** How often a running review re-checks the grace periods above. */
const TICK_MS = 5000;
/** How often an Open Code Review's elapsed time updates. */
const CLOCK_MS = 1000;

export interface AiReview {
  run?: AiReviewRun;
  view?: ProjectView;
  session?: SessionSummary;
  /** Where to follow the review session, once there is one. */
  sessionLink?: string;
  start: (
    kind: AiReviewRun["kind"],
    projectId: string,
    directory: string
  ) => void;
  /** Asks for findings without waiting for the session to go idle. */
  collectNow: () => void;
  retry: () => void;
  clear: () => void;
  /** Marks a suggestion accepted or dismissed, so it leaves the diff. */
  handle: (id: string) => void;
  /** Shows a stored earlier review's findings in the diff, in place of the current run. */
  open: (review: StoredAiReview) => void;
  /**
   * An Open Code Review whose request was lost (the page reloaded mid-run): the server still stores its result,
   * so `adopt` takes it from the earlier reviews once it is there.
   */
  orphaned: boolean;
  adopt: (review: StoredAiReview) => void;
}

/** Errors that the provider's settings fix: missing setup, a rejected key, an unknown model. */
const PROVIDER_ERROR =
  /set up open code review|unauthori[sz]ed|authenticat|forbidden|api key|\b40[13]\b|model.*(?:not found|does not exist|invalid)|no valid llm endpoint/iu;

/**
 * An AI review of the pull request's head commit. An agent review waits for its checkout's opencode, runs a
 * review session there and collects the findings once the session goes idle; a quick review collects findings
 * from the diff straight away. The run is remembered per pull request, so a reload carries on.
 */
export const useAiReview = (details: ForgejoPullDetails): AiReview => {
  const { snapshot } = useDash();
  const { pull, headSha } = details;
  const [run, setRunState] = useState(() => readAiRun(pull, headSha));
  const runRef = useRef(run);
  const setRun = useCallback(
    (next: AiReviewRun | undefined) => {
      runRef.current = next;
      setRunState(next);
      saveAiRun(pull, next);
    },
    [pull]
  );
  /** Applies a change to the run that `id` names, unless another run replaced it meanwhile. */
  const patch = useCallback(
    (id: string, change: Partial<AiReviewRun>) => {
      const { current } = runRef;
      if (current?.id === id) {
        setRun({ ...current, ...change });
      }
    },
    [setRun]
  );
  const busy = useRef(false);
  const sawBusy = useRef(false);
  const [tick, setTick] = useState(0);

  const view = snapshot?.projects.find((p) => p.project.id === run?.projectId);
  const checkout = view && run ? checkoutOf(view, run.directory) : undefined;
  const runtime =
    view && checkout && run ? checkoutRuntime(view, run.directory) : undefined;
  const ready =
    runtime?.containerState === "running" && runtime.opencode === "healthy";
  const session = run?.sessionId
    ? view?.sessions.find((s) => s.id === run.sessionId)
    : undefined;

  const collect = useCallback(
    async (current: AiReviewRun) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      patch(current.id, { error: undefined, stage: "collecting" });
      try {
        const result = await collectAiReview(
          pull.owner,
          pull.repo,
          String(pull.number),
          {
            commitId: headSha,
            directory: current.directory,
            projectId: current.projectId,
            ...(current.sessionId ? { sessionId: current.sessionId } : {}),
          }
        );
        patch(current.id, {
          findings: result.findings,
          handled: [],
          sessionId: result.sessionId,
          stage: "done",
          summary: result.summary,
        });
      } catch (error) {
        patch(current.id, { error: message(error), stage: "failed" });
      } finally {
        busy.current = false;
      }
    },
    [patch, headSha, pull]
  );

  /** Open Code Review: install it in the checkout's environment, then review; one request each. */
  const ocrInFlight = useRef(false);
  const runOcr = useCallback(
    async (current: AiReviewRun) => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      ocrInFlight.current = true;
      const where = {
        directory: current.directory,
        projectId: current.projectId,
      };
      try {
        patch(current.id, { error: undefined, stage: "installing" });
        await installOcr(where);
        patch(current.id, { stage: "reviewing", startedAt: Date.now() });
        const result = await runOcrReview(
          pull.owner,
          pull.repo,
          String(pull.number),
          { ...where, commitId: headSha, runId: current.id }
        );
        patch(current.id, {
          findings: result.findings,
          handled: [],
          stage: "done",
          summary: result.summary,
          ...(result.stats ? { stats: result.stats } : {}),
        });
      } catch (error) {
        const text = message(error);
        patch(current.id, {
          error: text,
          settingsError: PROVIDER_ERROR.test(text),
          stage: "failed",
        });
      } finally {
        busy.current = false;
        ocrInFlight.current = false;
      }
    },
    [patch, headSha, pull]
  );

  // Installing: (re)start an Open Code Review, also after a reload lost the install request.
  useEffect(() => {
    const { current } = runRef;
    if (current?.kind === "ocr" && current.stage === "installing") {
      void runOcr(current);
    }
  }, [run?.stage, runOcr]);

  // Waiting: start the review session once the checkout can run it.
  useEffect(() => {
    const { current } = runRef;
    if (current?.stage !== "waiting" || !ready || busy.current) {
      return;
    }
    busy.current = true;
    void (async () => {
      try {
        const sessionId = await startAiReviewSession(
          pull.owner,
          pull.repo,
          String(pull.number),
          {
            commitId: headSha,
            directory: current.directory,
            projectId: current.projectId,
          }
        );
        sawBusy.current = false;
        patch(current.id, {
          sessionId,
          stage: "reviewing",
          startedAt: Date.now(),
        });
      } catch (error) {
        patch(current.id, { error: message(error), stage: "failed" });
      } finally {
        busy.current = false;
      }
    })();
  }, [run?.stage, ready, patch, headSha, pull]);

  // Reviewing: collect once the session has worked and gone idle again.
  useEffect(() => {
    const { current } = runRef;
    if (current?.stage !== "reviewing" || current.kind === "ocr") {
      return;
    }
    const waited = Date.now() - current.startedAt;
    if (!session) {
      if (view && waited > GONE_MS) {
        patch(current.id, {
          error: "The review conversation is gone.",
          stage: "failed",
        });
      }
      return;
    }
    if (session.status !== "idle") {
      sawBusy.current = true;
      return;
    }
    if (sawBusy.current || waited > IDLE_GRACE_MS) {
      void collect(current);
    }
  }, [run?.stage, session, view, tick, collect, patch]);

  useEffect(() => {
    if (run?.stage !== "reviewing") {
      return;
    }
    // Open Code Review shows how long it has been running.
    const timer = setInterval(
      () => setTick((n) => n + 1),
      run.kind === "ocr" ? CLOCK_MS : TICK_MS
    );
    return () => clearInterval(timer);
  }, [run?.stage, run?.kind]);

  // Collecting after a reload: the request that was in flight is lost, so ask again.
  useEffect(() => {
    const { current } = runRef;
    if (current?.stage === "collecting" && !busy.current) {
      void collect(current);
    }
  }, [run?.stage, collect]);

  let sessionLink: string | undefined;
  if (view && session) {
    sessionLink = sessionPath(view, session);
  } else if (view && run?.sessionId) {
    // Not listed yet: the project page sends it on to its task once it is.
    sessionLink = `/p/${encodeURIComponent(view.project.id)}?session=${encodeURIComponent(run.sessionId)}`;
  }

  const toRun = (review: StoredAiReview): AiReviewRun => {
    let kind: AiReviewRun["kind"] = "quick";
    if (review.mode === "session") {
      kind = "agent";
    } else if (review.mode === "ocr") {
      kind = "ocr";
    }
    return {
      directory: "",
      findings: review.findings,
      handled: [],
      headSha,
      id: `stored-${review.id}`,
      kind,
      projectId: "",
      stage: "done",
      startedAt: review.createdAt,
      summary: review.summary,
      ...(review.sessionId ? { sessionId: review.sessionId } : {}),
      ...(review.stats ? { stats: review.stats } : {}),
    };
  };

  return {
    adopt: (review) => {
      const { current } = runRef;
      if (current) {
        setRun({ ...toRun(review), id: current.id });
      }
    },
    clear: () => setRun(undefined),
    collectNow: () => {
      const { current } = runRef;
      if (current?.sessionId) {
        void collect(current);
      }
    },
    handle: (id) => {
      const { current } = runRef;
      if (current) {
        setRun({ ...current, handled: [...(current.handled ?? []), id] });
      }
    },
    retry: () => {
      const { current } = runRef;
      if (!current) {
        return;
      }
      if (current.kind === "ocr") {
        setRun({
          ...current,
          error: undefined,
          settingsError: undefined,
          stage: "installing",
        });
      } else if (current.kind === "quick") {
        setRun({ ...current, error: undefined, stage: "collecting" });
      } else if (current.sessionId) {
        sawBusy.current = false;
        setRun({
          ...current,
          error: undefined,
          stage: "reviewing",
          startedAt: 0,
        });
      } else {
        setRun({ ...current, error: undefined, stage: "waiting" });
      }
    },
    open: (review) => setRun(toRun(review)),
    orphaned:
      run?.kind === "ocr" && run.stage === "reviewing" && !ocrInFlight.current,
    run,
    session,
    sessionLink,
    start: (kind, projectId, directory) => {
      sawBusy.current = false;
      setRun({
        directory,
        headSha,
        id: newId(),
        kind,
        projectId,
        stage: startStage[kind],
        startedAt: Date.now(),
      });
    },
    view,
  };
};

const startStage: Record<AiReviewRun["kind"], AiReviewRun["stage"]> = {
  agent: "waiting",
  ocr: "installing",
  quick: "collecting",
};

const NEW_WORKTREE = "new";
const matchKey = (m: { projectId: string; directory: string }) =>
  `${m.projectId}\n${m.directory}`;

/** What the dialog says about Open Code Review in the chosen project, and whether it can start there. */
const OcrModelNote = (props: { projectId: string }) => {
  const query = useProjectOcr(props.projectId || undefined);
  const e = query.data?.effective;
  if (!props.projectId || !e) {
    return null;
  }
  if (!e.configured) {
    return (
      <Note error>
        Open Code Review isn&apos;t set up for this project.{" "}
        <SettingsLink section={OCR_SECTION} className="underline">
          Set it up in Settings
        </SettingsLink>
        {query.data?.override.mode === "custom" &&
          ", or complete the project's own provider in its settings"}
        .
      </Note>
    );
  }
  return (
    <Note>
      Reviews with <strong>{e.model}</strong> via {e.provider}
      {e.source === "project" ? " (project)" : ""}.
    </Note>
  );
};

/**
 * Where to run an AI review. The agent engine reviews in a checkout of the pull request, or quickly from the
 * diff; Open Code Review runs its own file-by-file review in a checkout.
 */
export const ForgejoAiReviewDialog = (props: {
  details: ForgejoPullDetails;
  engine?: "agent" | "ocr";
  onStart: AiReview["start"];
  onClose: () => void;
}) => {
  const { details } = props;
  const ocr = props.engine === "ocr";
  const { snapshot } = useDash();
  const projects = snapshot?.projects ?? [];
  const links = useForgejoCheckouts(details);
  const matches = links.data?.matches ?? [];
  const exact = matches.filter((m) => m.exact);
  const [picked, setPicked] = useState("");
  const choice = picked || (exact[0] ? matchKey(exact[0]) : NEW_WORKTREE);
  const [project, setProject] = useState("");
  const newProject = project || matches[0]?.projectId || "";
  const [branch, setBranch] = useState(`review/pr-${details.pull.number}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const quick = ocr ? undefined : (exact[0] ?? matches[0]);
  const chosenProject =
    choice === NEW_WORKTREE ? newProject : (choice.split("\n")[0] ?? "");
  const ocrState = useProjectOcr(ocr ? chosenProject || undefined : undefined);
  const ocrBlocked = ocr && !ocrState.data?.effective.configured;
  const engine = ocr ? "ocr" : "agent";
  const label = (m: { projectId: string; directory: string }) => {
    const view = projects.find((p) => p.project.id === m.projectId);
    const c = view && checkouts(view).find((k) => k.directory === m.directory);
    return `${view?.project.name ?? m.projectId} · ${c?.label ?? m.directory}`;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (choice !== NEW_WORKTREE) {
      const [projectId = "", directory = ""] = choice.split("\n");
      props.onStart(engine, projectId, directory);
      props.onClose();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const { worktree } = await createForgejoWorktree(
        details.pull.owner,
        details.pull.repo,
        String(details.pull.number),
        newProject,
        branch.trim(),
        details.headSha
      );
      props.onStart(engine, newProject, worktree.path);
      props.onClose();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };
  const radio = (value: string, text: string, hint?: string) => (
    <label key={value} className="flex items-start gap-2 text-sm">
      <input
        type="radio"
        name="ai-review-checkout"
        className="accent-primary mt-1"
        value={value}
        checked={choice === value}
        onChange={() => setPicked(value)}
      />
      <span>
        {text}
        {hint && (
          <span className="text-muted-foreground block text-xs">{hint}</span>
        )}
      </span>
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && props.onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {ocr ? "Open Code Review" : "AI review"} of #{details.pull.number}
            </DialogTitle>
            <DialogDescription>
              {ocr
                ? "Open Code Review reviews the head commit file by file in a checkout of the pull request, with the model set for its project. It doesn't change anything. Its findings, with suggested code, appear in the diff for you to accept, edit or dismiss."
                : "An agent reviews the head commit in a checkout of the pull request, where it can read the surrounding code and run tests. It doesn't change anything. Its findings appear in the diff as suggestions for you to accept, edit or dismiss."}
            </DialogDescription>
          </DialogHeader>
          <RequestState query={links} />
          <fieldset disabled={busy} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Review in</legend>
            {exact.map((m) =>
              radio(matchKey(m), label(m), "Checkout of this pull request")
            )}
            {radio(
              NEW_WORKTREE,
              "A new worktree at the head commit",
              "Starts its own container when the project's doesn't mount worktrees."
            )}
            {choice === NEW_WORKTREE && (
              <div className="grid gap-3 pl-6 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="ai-review-project">Project</Label>
                  <Choice
                    id="ai-review-project"
                    size="default"
                    value={newProject}
                    onChange={setProject}
                    options={[
                      { label: "Select project", value: "" },
                      ...projects.map((p) => ({
                        label: p.project.name,
                        value: p.project.id,
                      })),
                    ]}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ai-review-branch">Branch</Label>
                  <Input
                    id="ai-review-branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  />
                </div>
              </div>
            )}
          </fieldset>
          {ocr && <OcrModelNote projectId={chosenProject} />}
          {quick && (
            <Note>
              In a hurry? A quick review reads only the diff, in {label(quick)}.
            </Note>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter className="flex-wrap">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={props.onClose}
            >
              Cancel
            </Button>
            {quick && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  props.onStart("quick", quick.projectId, quick.directory);
                  props.onClose();
                }}
              >
                Quick review
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                busy ||
                ocrBlocked ||
                (choice === NEW_WORKTREE && (!newProject || !branch.trim()))
              }
            >
              {busy && "Creating worktree…"}
              {!busy && (ocr ? "Start OCR review" : "Start agent review")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const SEVERITY_STYLE: Record<AiSeverity, string> = {
  blocker: "bg-destructive/15 text-destructive",
  major: "bg-warn/15 text-warn",
  minor: "bg-muted text-muted-foreground",
  nit: "bg-muted text-muted-foreground",
};

export const SeverityChip = ({ severity }: { severity: AiSeverity }) => (
  <Chip className={SEVERITY_STYLE[severity]}>{severity}</Chip>
);

/** mm:ss since `from`. */
export const elapsed = (from: number, now = Date.now()): string => {
  const seconds = Math.max(0, Math.floor((now - from) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

const ocrStageText = (run: AiReviewRun, orphaned: boolean): string => {
  if (run.stage === "installing") {
    return "Installing Open Code Review…";
  }
  if (orphaned) {
    return `Open Code Review is still reviewing (${elapsed(run.startedAt)}). Its result shows up here, and under earlier AI reviews, once it is stored.`;
  }
  return `Open Code Review is reviewing… (${elapsed(run.startedAt)})`;
};

/** "3 files reviewed, 1 skipped" for an Open Code Review run. */
export const ocrStatsText = (stats: OcrRunStats): string =>
  `${stats.filesReviewed} file${stats.filesReviewed === 1 ? "" : "s"} reviewed${stats.filesSkipped ? `, ${stats.filesSkipped} skipped` : ""}`;

const stageText = (
  run: AiReviewRun,
  session?: SessionSummary,
  orphaned = false
): string => {
  if (run.kind === "ocr") {
    return ocrStageText(run, orphaned);
  }
  if (run.stage === "waiting") {
    return "Waiting for the checkout's container and opencode…";
  }
  if (run.stage === "reviewing") {
    if (
      session?.status === "needs-permission" ||
      session?.status === "needs-answer"
    ) {
      return "The review conversation is waiting on you.";
    }
    return "The agent is reviewing the changes…";
  }
  if (run.stage === "collecting") {
    return run.kind === "quick"
      ? "Reviewing the diff…"
      : "Writing up the findings…";
  }
  return "";
};

/**
 * The AI review's progress, its summary and the findings that don't belong on a line. In Review mode a general
 * finding can go into the review summary; in Address mode it can go to the agent.
 */
export const AiReviewPanel = (props: {
  ai: Pick<
    AiReview,
    | "run"
    | "session"
    | "sessionLink"
    | "orphaned"
    | "collectNow"
    | "retry"
    | "clear"
  >;
  general: AiSuggestion[];
  /** Count of suggestions still open in the diff. */
  inline: number;
  renderGeneral: (s: AiSuggestion) => ReactNode;
  onRerun: () => void;
}) => {
  const { ai } = props;
  const { run } = ai;
  const [ocrLogOpen, setOcrLogOpen] = useState(false);
  const log = useQuery({
    queryKey: ["ocr-log", run?.id, run?.stage],
    queryFn: () => fetchOcrLog(run?.id ?? ""),
    enabled: ocrLogOpen && run?.kind === "ocr",
    refetchInterval:
      run?.stage === "installing" || run?.stage === "reviewing" ? 1000 : false,
  });
  if (!run) {
    return null;
  }
  const working =
    run.stage === "waiting" ||
    run.stage === "installing" ||
    run.stage === "reviewing" ||
    run.stage === "collecting";
  let logText =
    log.data?.lines.join("\n") ||
    "No progress logs are available for this run.";
  if (!log.data?.lines.length && working) {
    logText = "Waiting for Open Code Review progress…";
  }
  const isOcr = run.kind === "ocr";
  return (
    <section
      aria-label="AI review"
      className="bg-card flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SparklesIcon className="text-primary size-4 shrink-0" />
        <h2 className="font-semibold">
          {isOcr ? "Open Code Review" : "AI review"}
        </h2>
        {run.stage === "done" && (
          <span className="text-muted-foreground text-sm">
            {props.inline} in the diff · {props.general.length} general
            {run.stats && ` · ${ocrStatsText(run.stats)}`}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {isOcr && (
            <Button
              variant="outline"
              size="sm"
              aria-expanded={ocrLogOpen}
              onClick={() => setOcrLogOpen((value) => !value)}
            >
              <TerminalIcon /> {ocrLogOpen ? "Hide progress" : "View progress"}
            </Button>
          )}
          {ai.sessionLink && (
            <Button asChild variant="ghost" size="sm">
              <Link to={ai.sessionLink}>
                <ExternalLinkIcon /> Conversation
              </Link>
            </Button>
          )}
          {run.stage === "reviewing" && !isOcr && (
            <Button variant="outline" size="sm" onClick={() => ai.collectNow()}>
              Collect findings now
            </Button>
          )}
          {run.stage === "failed" && (
            <Button variant="outline" size="sm" onClick={() => ai.retry()}>
              Retry
            </Button>
          )}
          {run.stage === "done" && (
            <Button variant="outline" size="sm" onClick={props.onRerun}>
              Run again
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (
                run.stage !== "done" ||
                (await confirm({
                  confirmLabel: "Clear",
                  description: "Its open suggestions are cleared with it.",
                  destructive: true,
                  title: "Clear the AI review?",
                }))
              ) {
                ai.clear();
              }
            }}
          >
            {working ? "Stop waiting" : "Clear"}
          </Button>
        </div>
      </div>
      {isOcr && ocrLogOpen && (
        <div className="rounded-lg border bg-zinc-950 p-3 text-zinc-100">
          <pre
            className="max-h-72 overflow-auto font-mono text-xs break-words whitespace-pre-wrap"
            aria-label="Open Code Review progress logs"
          >
            {logText}
          </pre>
        </div>
      )}
      {working && (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        <p role="status" className="text-muted-foreground text-sm">
          {stageText(run, ai.session, ai.orphaned)}
        </p>
      )}
      {run.stage === "failed" && (
        <Note error>
          <span className="whitespace-pre-wrap">
            {run.error ?? "The AI review failed."}
          </span>
          {run.settingsError && (
            <>
              {" "}
              <SettingsLink section={OCR_SECTION} className="underline">
                Open Code Review settings
              </SettingsLink>
            </>
          )}
        </Note>
      )}
      {run.stage === "done" && run.stats?.status === "skipped" && (
        <p className="text-muted-foreground text-sm">
          Open Code Review found nothing to review: no supported files changed.
        </p>
      )}
      {run.stage === "done" && !!run.stats?.totalTokens && (
        <p className="text-muted-foreground text-sm">
          {run.stats.totalTokens.toLocaleString()} tokens used
          {run.stats.inputTokens !== undefined &&
            run.stats.outputTokens !== undefined &&
            ` (${run.stats.inputTokens.toLocaleString()} input, ${run.stats.outputTokens.toLocaleString()} output)`}
        </p>
      )}
      {run.stage === "done" && run.summary && (
        <MarkdownBody>{run.summary}</MarkdownBody>
      )}
      {run.stage === "done" && !run.findings?.length && !run.summary && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CircleCheckIcon className="text-ok size-4" /> Nothing worth raising.
        </p>
      )}
      {!!props.general.length && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {props.general.map((s) => (
            <li key={s.id}>{props.renderGeneral(s)}</li>
          ))}
        </ul>
      )}
    </section>
  );
};

const SuggestionDiff = lazy(() => import("./suggestion-diff"));

const CodeBlock = ({ code }: { code: string }) => (
  <pre className="bg-muted overflow-x-auto rounded-md p-2 font-mono text-xs leading-relaxed">
    <code>{code.replace(/\n+$/u, "")}</code>
  </pre>
);

/** The code a finding suggests: as a patch of the code it quotes, or as a block on its own. */
const SuggestedCode = (props: { suggestion: AiSuggestion }) => {
  const { suggestion, existing, file } = props.suggestion;
  if (!suggestion) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">Suggested code</span>
      {existing ? (
        <div className="overflow-hidden rounded-md border">
          <Suspense fallback={<CodeBlock code={suggestion} />}>
            <SuggestionDiff
              file={file ?? "suggestion"}
              existing={existing}
              suggestion={suggestion}
            />
          </Suspense>
        </div>
      ) : (
        <CodeBlock code={suggestion} />
      )}
    </div>
  );
};

/** One AI suggestion, inside the diff or in the panel's general list. */
export const AiSuggestionCard = (props: {
  suggestion: AiSuggestion;
  /** Review mode: take it into your review. */
  onAccept?: (text: string) => void;
  /** Address mode: whether it goes to the agent. */
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  onDismiss: () => void;
  acceptLabel?: string;
  inDiff?: boolean;
}) => {
  const { suggestion: s } = props;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.body);
  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-3 py-2 font-sans text-sm",
        props.inDiff &&
          "border-primary/60 bg-card text-card-foreground mx-2 my-1 rounded-sm border border-l-3 border-dashed"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SparklesIcon className="text-primary size-3.5 shrink-0" />
        <span className="text-muted-foreground text-xs">AI suggestion</span>
        <SeverityChip severity={s.severity} />
        {s.category && (
          <Chip className="bg-primary/10 text-primary">{s.category}</Chip>
        )}
        {!props.inDiff && s.file && (
          <span className="text-muted-foreground font-mono text-xs break-all">
            {s.file}
            {s.line === undefined
              ? ""
              : `:${linesLabel({ ...s, startSide: s.side })}`}
          </span>
        )}
        {props.inDiff && s.start !== undefined && (
          <span className="text-muted-foreground text-xs">
            Lines {linesLabel({ ...s, startSide: s.side })}
          </span>
        )}
      </div>
      {editing ? (
        <Textarea
          aria-label="Edit suggestion"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened by an explicit Edit click
          autoFocus
        />
      ) : (
        <MarkdownBody>{s.body}</MarkdownBody>
      )}
      <SuggestedCode suggestion={s} />
      <div className="flex flex-wrap items-center gap-2">
        {props.onAccept && (
          <Button
            size="sm"
            disabled={!text.trim()}
            onClick={() => props.onAccept?.(editing ? text.trim() : s.body)}
          >
            {props.acceptLabel ?? "Accept"}
          </Button>
        )}
        {props.onAccept && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        {props.onSelect && (
          <label className="text-muted-foreground inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="accent-primary"
              checked={!!props.selected}
              onChange={(e) => props.onSelect?.(e.target.checked)}
            />
            Add to handoff
          </label>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground ml-auto"
          onClick={props.onDismiss}
        >
          <XIcon /> Dismiss
        </Button>
      </div>
    </div>
  );
};

/** Someone's inline Forgejo comment, shown at its line in the diff. */
export const ForgejoCommentNote = (props: {
  comment: ForgejoComment;
  anchor?: DiffNote;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
}) => {
  const { comment: c } = props;
  return (
    <div
      className={cn(
        "bg-card text-card-foreground mx-2 my-1 flex flex-col gap-1.5 rounded-sm border border-l-3 px-3 py-2 font-sans text-sm",
        c.resolved ? "border-l-muted-foreground/40 opacity-70" : "border-l-warn"
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <MessageSquareIcon className="text-muted-foreground size-3.5 shrink-0" />
        <strong>{c.author}</strong>
        {c.resolved && <Chip>Resolved</Chip>}
        {props.onSelect && (
          <label className="text-muted-foreground ml-auto inline-flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-primary"
              checked={!!props.selected}
              onChange={(e) => props.onSelect?.(e.target.checked)}
            />
            Add to handoff
          </label>
        )}
      </div>
      {props.anchor?.start !== undefined && (
        <p className="text-muted-foreground text-xs">
          Lines {linesLabel({ ...props.anchor, startSide: props.anchor.side })}
        </p>
      )}
      <MarkdownBody>{c.body}</MarkdownBody>
    </div>
  );
};

/** Whether the default provider is complete. */
const defaultConfigured = (settings?: OcrSettings): boolean =>
  !!settings &&
  !!settings.provider.url &&
  !!settings.provider.protocol &&
  !!settings.provider.model &&
  settings.provider.hasKey;

/**
 * Where Open Code Review stands for this pull request: ready when the default provider or a project with a
 * checkout of it is set up, else the project whose own provider is incomplete, if one is.
 */
const useOcrReadiness = (details: ForgejoPullDetails) => {
  const { snapshot } = useDash();
  const settings = useOcrSettings();
  const links = useForgejoCheckouts(details);
  const projectIds = [
    ...new Set((links.data?.matches ?? []).map((m) => m.projectId)),
  ];
  const projects = useQueries({
    queries: projectIds.map((id) => ({
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchProjectOcr(id, signal),
      queryKey: projectOcrKey(id),
    })),
  });
  const views = projects.map((q, i) => ({ id: projectIds[i], ocr: q.data }));
  const ready =
    defaultConfigured(settings.data) ||
    views.some((v) => v.ocr?.effective.configured);
  const incomplete = views.find(
    (v) => v.ocr?.override.mode === "custom" && !v.ocr.effective.configured
  );
  const view = incomplete
    ? snapshot?.projects.find((p) => p.project.id === incomplete.id)
    : undefined;
  return { incompleteProject: view, ready };
};

/** The PR header's AI review button: the agent review, or Open Code Review once it is set up. */
export const AiReviewMenu = (props: {
  details: ForgejoPullDetails;
  busy: boolean;
  onPick: (engine: "agent" | "ocr") => void;
}) => {
  const ocr = useOcrReadiness(props.details);
  const [projectSettings, setProjectSettings] = useState(false);
  const navigate = useNavigate();
  const settingsHref = useSettingsHref();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={props.busy}>
            <SparklesIcon /> {props.busy ? "AI reviewing…" : "AI review"}
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => props.onPick("agent")}>
            <BotIcon />
            <span className="flex flex-col">
              <span>Agent review</span>
              <span className="text-muted-foreground text-xs">
                An opencode agent investigates in a checkout.
              </span>
            </span>
          </DropdownMenuItem>
          {ocr.ready && (
            <DropdownMenuItem onSelect={() => props.onPick("ocr")}>
              <ScanSearchIcon />
              <span className="flex flex-col">
                <span>Open Code Review</span>
                <span className="text-muted-foreground text-xs">
                  Reviews file by file and suggests code.
                </span>
              </span>
            </DropdownMenuItem>
          )}
          {!ocr.ready && ocr.incompleteProject && (
            <DropdownMenuItem onSelect={() => setProjectSettings(true)}>
              <ScanSearchIcon />
              <span className="flex flex-col">
                <span>Set up Open Code Review…</span>
                <span className="text-muted-foreground text-xs">
                  Complete {ocr.incompleteProject.project.name}&apos;s own
                  provider.
                </span>
              </span>
            </DropdownMenuItem>
          )}
          {!ocr.ready && !ocr.incompleteProject && (
            <DropdownMenuItem
              onSelect={() => void navigate(settingsHref(OCR_SECTION))}
            >
              <ScanSearchIcon />
              <span className="flex flex-col">
                <span>Set up Open Code Review…</span>
                <span className="text-muted-foreground text-xs">
                  Choose the model it reviews with.
                </span>
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {ocr.incompleteProject && (
        <ProjectSettingsDialog
          view={ocr.incompleteProject}
          open={projectSettings}
          onOpenChange={setProjectSettings}
        />
      )}
    </>
  );
};
