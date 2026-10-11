import type { ReactNode } from "react";

import { Empty, muted, Note } from "../../components/page";
import { workspaceFolderOf } from "../../derive";
import { CheckoutProvider } from "../checkouts/checkout-context";
import { CheckoutRuntime } from "../checkouts/checkout-page";
import { checkoutOf } from "../checkouts/checkouts";
import { ProjectReview } from "../review/project-review";
import { useTaskPage } from "./task-context";
import { startStepLabel } from "./tasks";

/** Gives a tab the selected variant's checkout, or says why it has none: still being set up, or removed. */
export const VariantCheckout = (props: { children: ReactNode }) => {
  const { view, variant } = useTaskPage();
  if (!variant.directory) {
    return (
      <Empty title="Not ready yet">
        <p className={muted}>
          {variant.step === "failed"
            ? "This variant failed to start, so it has no worktree."
            : `${startStepLabel(variant.step)}…`}
        </p>
      </Empty>
    );
  }
  const checkout = checkoutOf(view, variant.directory);
  if (!checkout) {
    return (
      <Empty title="Worktree removed">
        <p className={muted}>
          This variant&apos;s worktree is gone, so there are no changes,
          terminal or runtime to show.
        </p>
      </Empty>
    );
  }
  return (
    <CheckoutProvider
      value={{
        checkout,
        view,
        ...(variant.sessionId ? { sessionId: variant.sessionId } : {}),
      }}
    >
      {props.children}
    </CheckoutProvider>
  );
};

/** The variant's worktree changes; a workspace task's are the main checkout's, which other conversations share. */
export const TaskChanges = () => {
  const { view, variant } = useTaskPage();
  const shared =
    !!variant.directory && variant.directory === workspaceFolderOf(view);
  return (
    <div className="flex flex-col gap-4">
      {shared && (
        <Note>
          This task works in the main checkout, so these are the main
          checkout&apos;s changes, shared with the other conversations there.
        </Note>
      )}
      <VariantCheckout>
        <ProjectReview />
      </VariantCheckout>
    </div>
  );
};

export const TaskRuntime = () => (
  <VariantCheckout>
    <CheckoutRuntime />
  </VariantCheckout>
);
