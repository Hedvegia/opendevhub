import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { ProjectView } from "../../../shared/types";
import type { Checkout } from "./checkouts";

/**
 * The checkout a tab works on (Changes, Terminal, Runtime, Conversation) and, for the Conversation, its session. The
 * checkout page provides it from the route; the task page from the selected variant.
 */
export interface CheckoutContextValue {
  view: ProjectView;
  checkout: Checkout;
  sessionId?: string;
}

const CheckoutCtx = createContext<CheckoutContextValue | undefined>(undefined);

export const CheckoutProvider = (props: {
  value: CheckoutContextValue;
  children: ReactNode;
}) => <CheckoutCtx value={props.value}>{props.children}</CheckoutCtx>;

export const useCheckoutContext = (): CheckoutContextValue => {
  const value = useContext(CheckoutCtx);
  if (!value) {
    throw new Error(
      "useCheckoutContext must be used inside a CheckoutProvider"
    );
  }
  return value;
};
