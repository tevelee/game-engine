/**
 * std.actions.noLegalActions.v1 — utilities for checking action availability.
 *
 * Provides the `hasLegalAction` predicate, which is a native recursive primitive:
 * evaluating it asks the action system whether any legal binding combination exists
 * for the given player + action list. The runtime handles the recursion guard.
 */

import type { SourceRef, IRExpr, IRPredicate } from "../ir/types";

export const ACTIONS_MODULE = "std.actions.noLegalActions.v1";

/**
 * True iff `player` has at least one legal instance of any action in `actions`.
 *
 * This is a recursive primitive — the runtime guards against infinite recursion
 * through its `_hasLegalActionDepth` counter.
 */
export function hasLegalAction(player: IRExpr, actions: string[], src?: SourceRef): IRPredicate {
  return { kind: "hasLegalAction", player, actions, irType: "bool", src };
}
