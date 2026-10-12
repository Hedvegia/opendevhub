import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListTodoIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { ProjectTodo } from "../../../shared/types";
import { addTodo, fetchTodos, removeTodo, updateTodo } from "../../api";
import { muted } from "../../components/page";

const todosKey = (projectId: string) => ["todos", projectId] as const;

const useTodos = (projectId: string) => {
  const queryClient = useQueryClient();
  const key = todosKey(projectId);
  const query = useQuery({
    queryFn: ({ signal }) => fetchTodos(projectId, signal),
    queryKey: key,
  });
  const set = (fn: (todos: ProjectTodo[]) => ProjectTodo[]) =>
    queryClient.setQueryData(
      key,
      (old: { todos: ProjectTodo[] } | undefined) =>
        old ? { todos: fn(old.todos) } : old
    );
  const add = useMutation({
    mutationFn: (text: string) => addTodo(projectId, text),
    onSuccess: (todo) => set((todos) => [...todos, todo]),
  });
  const update = useMutation({
    mutationFn: (v: { id: number; done: boolean }) =>
      updateTodo(projectId, v.id, { done: v.done }),
    onSuccess: (todo) =>
      set((todos) => todos.map((t) => (t.id === todo.id ? todo : t))),
  });
  const remove = useMutation({
    mutationFn: (id: number) => removeTodo(projectId, id),
    onSuccess: (_, id) => set((todos) => todos.filter((t) => t.id !== id)),
  });
  const error = query.error ?? add.error ?? update.error ?? remove.error;
  return { add, error, query, remove, update };
};

/** A header button showing how many of the project's to-dos are open; it opens the list in a dialog. */
export const TodoButton = (props: { projectId: string; subject: string }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { add, error, query, remove, update } = useTodos(props.projectId);
  const todos = query.data?.todos ?? [];
  const openCount = todos.filter((t) => !t.done).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) {
      return;
    }
    add.mutate(text, { onSuccess: () => setDraft("") });
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={`To-do, ${openCount} open`}
      >
        <ListTodoIcon /> To-do
        {openCount > 0 && (
          <span className="text-muted-foreground tabular-nums">
            {openCount}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>To-do</DialogTitle>
            <DialogDescription>{props.subject}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex gap-2">
            <Input
              autoFocus
              placeholder="Add a to-do"
              aria-label="New to-do"
              maxLength={500}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!draft.trim() || add.isPending}
            >
              <PlusIcon /> Add
            </Button>
          </form>
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error.message}
            </p>
          )}
          {query.isSuccess && todos.length === 0 && (
            <p className={cn(muted, "py-4 text-center")}>Nothing to do yet.</p>
          )}
          {todos.length > 0 && (
            <ul className="-mx-2 min-h-0 overflow-y-auto">
              {todos.map((t) => (
                <li
                  key={t.id}
                  className="group hover:bg-muted/50 flex items-center gap-3 rounded-md px-2 py-1.5"
                >
                  <Checkbox
                    id={`todo-${t.id}`}
                    checked={t.done}
                    onCheckedChange={(checked) =>
                      update.mutate({ done: checked === true, id: t.id })
                    }
                  />
                  <label
                    htmlFor={`todo-${t.id}`}
                    className={cn(
                      "min-w-0 flex-1 text-sm break-words",
                      t.done && "text-muted-foreground line-through"
                    )}
                  >
                    {t.text}
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Delete “${t.text}”`}
                    onClick={() => remove.mutate(t.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
