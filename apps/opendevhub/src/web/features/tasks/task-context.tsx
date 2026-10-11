import { createContext, useContext } from "react";

import type {
  ProjectView,
  SessionSummary,
  TaskView,
  VariantView,
} from "../../../shared/types";

/** The task a task page shows, and the variant its tabs show (`?v=`). */
export interface TaskPageValue {
  view: ProjectView;
  task: TaskView;
  variant: VariantView;
  /** The task's live sessions in variant order. */
  sessions: SessionSummary[];
}

export const TaskPageCtx = createContext<TaskPageValue | undefined>(undefined);

export const useTaskPage = (): TaskPageValue => {
  const value = useContext(TaskPageCtx);
  if (!value) {
    throw new Error("useTaskPage must be used inside ProjectTask");
  }
  return value;
};
