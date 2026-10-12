import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The shell's right-hand slot: `undefined` outside a shell (stories, tests), `null` while the shell's slot mounts,
 * and the slot's element after.
 */
const SlotContext = createContext<HTMLElement | null | undefined>(undefined);

/**
 * Wraps the shell's main column and adds a slot after it, so a page can put a sidebar on the right edge of the window,
 * full height, beside the main column rather than inside its padding.
 */
export const RightSidebarHost = ({ children }: { children: ReactNode }) => {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <SlotContext.Provider value={slot}>
      {children}
      <div ref={setSlot} className="contents" />
    </SlotContext.Provider>
  );
};

/** Renders its children in the shell's right slot, or in place where there is no shell. */
export const RightSidebar = ({ children }: { children: ReactNode }) => {
  const slot = useContext(SlotContext);
  if (slot === undefined) {
    return children;
  }
  return slot ? createPortal(children, slot) : null;
};
