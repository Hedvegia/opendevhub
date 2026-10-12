import { GaugeIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { SessionDetail, SessionSummary } from "../../../shared/types";
import { When } from "../../components/when";
import { formatCost, formatTokens } from "../tasks/tasks";
import { breakdownLabel, contextShare } from "./session-detail";

const Figure = (props: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-muted-foreground text-xs font-medium">
      {props.label}
    </span>
    <span className="text-sm font-semibold tabular-nums">{props.value}</span>
    {props.children}
    {props.hint && (
      <span className="text-muted-foreground text-xs">{props.hint}</span>
    )}
  </div>
);

/**
 * A conversation's usage behind a small button: the button shows how full the context window is (or the context
 * tokens when the window is unknown), and its popover the cost, tokens, context, start and last outcome.
 */
export const UsagePopover = ({
  session,
  detail,
}: {
  session: SessionSummary;
  detail?: SessionDetail;
}) => {
  const share = contextShare(session.context, detail?.contextLimit);
  const percent = share === undefined ? undefined : Math.round(share * 100);
  const shown =
    percent === undefined ? formatTokens(session.context) : `${percent}%`;
  const withSubagents =
    detail && detail.subagents.length > 0 ? "subagents included" : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "tabular-nums",
            share !== undefined && share > 0.8 && "text-warn"
          )}
          aria-label={`Usage: ${shown} context`}
        >
          <GaugeIcon />
          {shown}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-72 grid-cols-2 gap-4">
        <Figure
          label="Cost"
          value={formatCost(session.cost)}
          hint={withSubagents}
        />
        <Figure
          label="Started"
          value={detail ? <When at={detail.createdAt} /> : "—"}
          hint={detail?.outcome && `Last run ${detail.outcome}`}
        />
        <div className="col-span-2">
          <Figure
            label="Tokens"
            value={formatTokens(session.tokens)}
            hint={
              detail?.tokens
                ? `Own: ${breakdownLabel(detail.tokens)}`
                : withSubagents
            }
          />
        </div>
        <div className="col-span-2">
          <Figure
            label="Context"
            value={
              <>
                {formatTokens(session.context)}
                {detail?.contextLimit && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    / {formatTokens(detail.contextLimit)}
                  </span>
                )}
              </>
            }
            hint={
              percent === undefined
                ? "As of the latest reply"
                : `${percent}% of the window`
            }
          >
            {share !== undefined && (
              <div
                className="bg-muted my-1 h-1.5 overflow-hidden rounded-full"
                role="meter"
                aria-label="Context window used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    share > 0.8 ? "bg-warn" : "bg-primary"
                  )}
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            )}
          </Figure>
        </div>
      </PopoverContent>
    </Popover>
  );
};
