import { api } from "~~/convex/_generated/api";
import { errorCodeOf } from "~/lib/attemptSync";
import {
  appendPage,
  canLoadMore,
  emptyPager,
  HISTORY_PAGE_SIZE,
  historyErrorMessage,
  historyRow,
  type Pager,
} from "~/lib/history";

/**
 * This browser's attempts from `review.myAttempts`, newest first, with "load
 * more" (T-217, EX-19). Client only. Starts over whenever the anon token
 * changes (an import replaces it), ignoring answers for the old token.
 */
export function useAttemptHistory(pageSize = HISTORY_PAGE_SIZE) {
  const { $convex } = useNuxtApp();
  const { token, ready } = useAnonIdentity();

  const pager = ref<Pager>(emptyPager());
  let generation = 0;

  async function loadMore() {
    const tok = token.value;
    if (!tok || !canLoadMore(pager.value)) return;
    const gen = generation;
    pager.value = { ...pager.value, loading: true };
    try {
      const page = await $convex.query(api.review.myAttempts, {
        anonToken: tok,
        paginationOpts: { numItems: pageSize, cursor: pager.value.cursor },
      });
      if (gen === generation) pager.value = appendPage(pager.value, page);
    } catch (err) {
      if (gen === generation) {
        pager.value = {
          ...pager.value,
          loading: false,
          error: historyErrorMessage(errorCodeOf(err)),
        };
      }
    }
  }

  function reset() {
    generation++;
    pager.value = emptyPager();
    void loadMore();
  }

  /** After an error: start over if nothing loaded, else retry the next page. */
  function retry() {
    if (pager.value.items.length === 0) return reset();
    pager.value = { ...pager.value, error: null };
    void loadMore();
  }

  if (import.meta.client) {
    watch(
      [ready, token],
      ([isReady, tok]) => {
        if (isReady && tok) reset();
      },
      { immediate: true },
    );
  }

  const now = ref(Date.now());
  const rows = computed(() => pager.value.items.map((a) => historyRow(a, now.value)));
  /** True until the first page has answered (or failed). */
  const firstLoad = computed(
    () => pager.value.items.length === 0 && !pager.value.isDone && pager.value.error === null,
  );

  return { pager, rows, firstLoad, loadMore, reset, retry };
}
