import { Button } from "@opendevhub/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@opendevhub/ui/dropdown-menu";
import { BotIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { AgentOption } from "../../../shared/types";

const ghost =
  "text-muted-foreground hover:text-foreground hover:bg-accent dark:bg-transparent dark:hover:bg-accent h-7 gap-1 border-0 bg-transparent px-2 text-xs shadow-none";

/**
 * The primary agent a message goes to, such as build or plan. `value` is what's shown: the user's pick, else the
 * conversation's agent, else the first agent opencode lists.
 */
export const AgentPicker = (props: {
  agents: AgentOption[] | undefined;
  value: string | undefined;
  onChange: (agent: string) => void;
  disabled?: boolean;
}) => {
  const { agents = [], value, onChange } = props;
  const label = agents.find((a) => a.id === value)?.name ?? value ?? "Agent";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(ghost, "min-w-0", value && "text-ok hover:text-ok")}
          disabled={props.disabled || agents.length === 0}
          aria-label={`Agent: ${value ? label : "default"}`}
        >
          <BotIcon />
          <span className="truncate capitalize">{label}</span>
          <ChevronDownIcon className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          Agent
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={onChange}>
          {agents.map((a) => (
            <DropdownMenuRadioItem
              key={a.id}
              value={a.id}
              className="items-start"
            >
              <span className="flex min-w-0 flex-col">
                <span className="capitalize">{a.name}</span>
                {a.description && (
                  <span className="text-muted-foreground line-clamp-2 text-xs">
                    {a.description}
                  </span>
                )}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
