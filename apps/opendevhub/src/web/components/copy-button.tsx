import { Button } from "@opendevhub/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@opendevhub/ui/tooltip";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

export const CopyButton = ({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) => {
  const [done, setDone] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={label}
          onClick={() =>
            void navigator.clipboard?.writeText(text).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1200);
            })
          }
        >
          {done ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{done ? "Copied" : label}</TooltipContent>
    </Tooltip>
  );
};
