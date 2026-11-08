import type { FunctionReturnType } from "convex/server";
import type { Id } from "~~/convex/_generated/dataModel";
import { api } from "~~/convex/_generated/api";
import { failureForStatus, failureOf, loadErrorCode, type LoadFailure } from "~/lib/attemptPages";

export type StudentResult = FunctionReturnType<typeof api.review.getResult>;
export type StudentReview = FunctionReturnType<typeof api.review.getReview>;

/**
 * A submitted attempt's result (and, with `withReview`, its review) for the
 * student pages under `/exam/[attemptId]/` (T-215, T-216). Client only: it
 * waits for the anon token. On `NOT_FOUND` it checks `attempts.getState` so
 * an unfinished attempt can offer "Return to exam".
 */
export function useStudentResult(attemptId: string, opts: { withReview?: boolean } = {}) {
  const { $convex } = useNuxtApp();
  const { token, ready } = useAnonIdentity();

  const result = shallowRef<StudentResult | null>(null);
  const review = shallowRef<StudentReview | null>(null);
  const failure = ref<LoadFailure | null>(null);
  const loading = ref(true);

  async function load(anonToken: string) {
    loading.value = true;
    failure.value = null;
    const args = { attemptId: attemptId as Id<"attempts">, anonToken };
    try {
      const [r, items] = await Promise.all([
        $convex.query(api.review.getResult, args),
        opts.withReview ? $convex.query(api.review.getReview, args) : Promise.resolve(null),
      ]);
      result.value = r;
      review.value = items;
    } catch (err) {
      let f = failureOf(loadErrorCode(err));
      if (f === "not_found") {
        const status = await $convex.query(api.attempts.getState, args).then(
          (s) => s.status,
          () => null,
        );
        f = failureForStatus(status);
      }
      failure.value = f;
    } finally {
      loading.value = false;
    }
  }

  function retry() {
    if (token.value) void load(token.value);
  }

  if (import.meta.client) {
    watch(
      [ready, token],
      ([isReady, tok]) => {
        if (!isReady) return;
        if (!tok) {
          failure.value = "bad_token";
          loading.value = false;
          return;
        }
        void load(tok);
      },
      { immediate: true },
    );
  }

  return { result, review, failure, loading, retry };
}
