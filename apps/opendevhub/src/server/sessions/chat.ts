import type {
  ChatStartRequest,
  ChatStartResult,
  ProjectId,
} from "../../shared/types";
import type { HubDeps } from "../environments/ports";
import { parseFirstMessage } from "../tasks/request";
import type { Tasks } from "../tasks/tasks";
import type { Sessions } from "./sessions";

/** Chat's start composer: the first message starts a task in a new worktree, or a conversation in a checkout. */
export class Chat {
  private readonly deps: HubDeps;
  private readonly sessions: Sessions;
  private readonly tasks: Tasks;
  constructor(deps: HubDeps, sessions: Sessions, tasks: Tasks) {
    this.deps = deps;
    this.sessions = sessions;
    this.tasks = tasks;
  }

  /**
   * A new worktree gets a one-variant task on the project's defaults, titled from the message, whose first turn is
   * the message; the task id comes back while the worktree is set up. A checkout gets a new conversation, owned by
   * a manual task, and the message is sent to it before answering.
   */
  async start(
    id: ProjectId,
    request: ChatStartRequest
  ): Promise<ChatStartResult> {
    const message = parseFirstMessage(request.message);
    const { target } = request;
    if (target.kind === "worktree") {
      const { task } = await this.tasks.startTask(id, {
        message,
        prompt: message.text,
        where: "worktree",
        ...(message.model ? { variants: [{ model: message.model }] } : {}),
      });
      return { task };
    }
    const sessionId = await this.sessions.startWithMessage(
      id,
      target.directory,
      message
    );
    const owner = this.deps.tasks.bySession(sessionId);
    if (!owner) {
      throw new Error(`the conversation ${sessionId} has no task`);
    }
    return { sessionId, task: owner.task.id };
  }
}
