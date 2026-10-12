import type { ProjectTodo } from "../../shared/types";
import { NotFoundError } from "../errors";
import type { Db } from "./database";

interface RawTodo {
  id: number;
  text: string;
  done_at: number | null;
  created_at: number;
}

const toTodo = (r: RawTodo): ProjectTodo => ({
  createdAt: r.created_at,
  done: r.done_at !== null,
  id: r.id,
  text: r.text,
});

const isForeignKeyViolation = (error: unknown) =>
  error instanceof Error &&
  /FOREIGN KEY constraint failed/u.test(error.message);

/** Each project's to-do list, in the order the items were added. */
export class TodoStore {
  private readonly db: Db;
  private readonly now: () => number;
  constructor(db: Db, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  /** The project's items, oldest first; none for an unknown project. */
  list(projectId: string): ProjectTodo[] {
    return (
      this.db
        .prepare("SELECT * FROM project_todos WHERE project_id = ? ORDER BY id")
        .all(projectId) as unknown as RawTodo[]
    ).map(toTodo);
  }

  /** Throws NotFoundError for an unknown project. */
  add(projectId: string, text: string): ProjectTodo {
    try {
      const row = this.db
        .prepare(
          "INSERT INTO project_todos (project_id, text, created_at) VALUES (?, ?, ?) RETURNING *"
        )
        .get(projectId, text, this.now()) as unknown as RawTodo;
      return toTodo(row);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new NotFoundError(projectId);
      }
      throw error;
    }
  }

  /** Rewords the item, checks it off or reopens it. Throws NotFoundError for an item not on the project's list. */
  update(
    projectId: string,
    id: number,
    changes: { text?: string; done?: boolean }
  ): ProjectTodo {
    const current = this.get(projectId, id);
    const text = changes.text ?? current.text;
    let doneAt = current.done_at;
    if (changes.done !== undefined && changes.done !== (doneAt !== null)) {
      doneAt = changes.done ? this.now() : null;
    }
    const row = this.db
      .prepare(
        "UPDATE project_todos SET text = ?, done_at = ? WHERE id = ? RETURNING *"
      )
      .get(text, doneAt, id) as unknown as RawTodo;
    return toTodo(row);
  }

  /** Throws NotFoundError for an item not on the project's list. */
  remove(projectId: string, id: number): void {
    const { changes } = this.db
      .prepare("DELETE FROM project_todos WHERE id = ? AND project_id = ?")
      .run(id, projectId);
    if (!changes) {
      throw new NotFoundError(String(id), "to-do");
    }
  }

  private get(projectId: string, id: number): RawTodo {
    const row = this.db
      .prepare("SELECT * FROM project_todos WHERE id = ? AND project_id = ?")
      .get(id, projectId) as RawTodo | undefined;
    if (!row) {
      throw new NotFoundError(String(id), "to-do");
    }
    return row;
  }
}
