import { Button } from "@opendevhub/ui/button";
import {
  ArrowUpIcon,
  EllipsisIcon,
  MessageSquareIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";

const meta = preview.meta({
  args: { children: "New task", onClick: fn() },
  argTypes: {
    size: {
      control: "select",
      options: [
        "default",
        "md",
        "xs",
        "sm",
        "lg",
        "icon",
        "iconOnly",
        "icon-xs",
        "icon-sm",
        "icon-lg",
      ],
    },
    variant: {
      control: "select",
      options: [
        "default",
        "primary",
        "secondary",
        "outline",
        "ghost",
        "link",
        "destructive",
        "attention",
      ],
    },
  },
  component: Button,
  parameters: { layout: "centered" },
  title: "UI/Button",
});

export const Default = meta.story({ args: { variant: "primary" } });

export const Design = meta.story({
  render: (args) => (
    <div className="bg-background text-foreground w-[min(100vw-2rem,630px)] rounded-lg border p-6">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-xl font-semibold">Button</h2>
        <span className="text-muted-foreground text-sm">
          Primitive · shadcn Button
        </span>
      </div>
      <p className="text-muted-foreground mb-5 font-mono text-xs">
        variant: primary | secondary | ghost | destructive | attention · size:
        sm | md | lg · icon · iconOnly · disabled
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button {...args} variant="primary">
          Start task
        </Button>
        <Button {...args} variant="secondary">
          Save draft
        </Button>
        <Button {...args} variant="ghost">
          Cancel
        </Button>
        <Button {...args} variant="destructive">
          Remove worktree
        </Button>
        <Button {...args} variant="attention">
          Allow once
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <Button {...args} size="lg" variant="primary">
          <PlusIcon />
          New task
        </Button>
        <Button {...args} variant="secondary">
          <MessageSquareIcon />
          New chat
        </Button>
        <Button {...args} size="sm" variant="secondary">
          Send to agent
        </Button>
        <Button {...args} variant="ghost">
          Re-run
        </Button>
        <Button
          {...args}
          aria-label="More options"
          size="iconOnly"
          variant="secondary"
        >
          <EllipsisIcon />
        </Button>
        <Button {...args} aria-label="Send" size="iconOnly" variant="primary">
          <ArrowUpIcon />
        </Button>
      </div>
      <div className="mt-2">
        <Button {...args} disabled variant="primary">
          Publish
        </Button>
      </div>
      <p className="text-muted-foreground mt-5 text-sm">
        Attention is reserved for the one action that unblocks an agent. Never
        more than one per card.
      </p>
    </div>
  ),
});

export const Variants = meta.story({
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} variant="primary">
        Primary
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="link">
        Link
      </Button>
      <Button {...args} variant="destructive">
        Destructive
      </Button>
      <Button {...args} variant="attention">
        Attention
      </Button>
    </div>
  ),
});

export const Sizes = meta.story({
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button {...args} size="xs">
        Extra small
      </Button>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
});

export const WithIcon = meta.story({
  args: {
    children: (
      <>
        <PlusIcon /> New task
      </>
    ),
  },
});

export const IconOnly = meta.story({
  args: {
    "aria-label": "Remove",
    children: <TrashIcon />,
    size: "icon",
    variant: "ghost",
  },
});

export const Disabled = meta.story({ args: { disabled: true } });
