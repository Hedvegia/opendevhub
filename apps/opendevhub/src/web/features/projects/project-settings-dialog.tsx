import { SettingsIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ProjectView } from "../../../shared/types";
import { Tip } from "../../components/tip";
import { ChecksSettings } from "../checks/checks-settings";
import { LinksSettings } from "./links-settings";
import { OcrProjectSettingsBlock } from "./ocr-project-settings";
import { HostPortsSettings, PortsSettings } from "./ports-settings";

/** The project's settings over the current page. */
export const ProjectSettingsDialog = (props: {
  view: ProjectView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { view, open } = props;
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>{view.project.name}</DialogDescription>
        </DialogHeader>
        {/* Mounted per opening, so the settings are fetched fresh. */}
        {open && (
          <div className="flex flex-col gap-6">
            <LinksSettings projectId={view.project.id} />
            <OcrProjectSettingsBlock projectId={view.project.id} />
            <PortsSettings projectId={view.project.id} />
            <HostPortsSettings projectId={view.project.id} />
            <ChecksSettings projectId={view.project.id} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** A gear in the project's header that opens its settings. */
export const ProjectSettingsButton = ({ view }: { view: ProjectView }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tip label="Project settings">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          aria-label="Project settings"
          onClick={() => setOpen(true)}
        >
          <SettingsIcon />
        </Button>
      </Tip>
      <ProjectSettingsDialog view={view} open={open} onOpenChange={setOpen} />
    </>
  );
};
