/**
 * Unique class code allocation (PRD CL-1, LLD §3.1 `classes.by_code`).
 *
 * There are 32^4 ≈ 1M codes, so a clash with an existing class is rare but
 * possible: draw again until `by_code` is free, a bounded number of times.
 * The read joins the mutation's transaction, so two concurrent creates that
 * draw the same code conflict and one retries (Convex OCC); no duplicates.
 */
import type { MutationCtx } from "../_generated/server";
import { newClassCode } from "./codes";

/** Draws before giving up. At 50% occupancy, 8 clashes in a row is ~0.4%. */
export const CLASS_CODE_ATTEMPTS = 8;

export async function allocateClassCode(
  ctx: Pick<MutationCtx, "db">,
  draw: () => string = newClassCode,
): Promise<string> {
  for (let i = 0; i < CLASS_CODE_ATTEMPTS; i++) {
    const code = draw();
    const taken = await ctx.db
      .query("classes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!taken) return code;
  }
  throw new Error("Could not allocate a unique class code");
}
