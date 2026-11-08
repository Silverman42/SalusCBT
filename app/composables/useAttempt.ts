import type { FunctionReturnType } from "convex/server";
import { computed, onScopeDispose, ref, shallowRef, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import type { AnswerValue } from "~~/shared/content";
import {
  AttemptSync,
  errorCodeOf,
  rememberStartClock,
  type AttemptStatus,
  type ResponseMap,
  type StorageLike,
  type SyncSnapshot,
} from "~/lib/attemptSync";

export type AttemptPaper = FunctionReturnType<typeof api.attempts.getPaper>;
export type AttemptPaperQuestion = AttemptPaper["questions"][number];

/** `submit()` refused because answers are still unsaved (pass `force` to submit anyway). */
export class SavesPendingError extends Error {
  readonly code = "SAVES_PENDING";
  constructor(readonly pending: number) {
    super(`${pending} answer(s) not saved yet.`);
  }
}

/** Larger than any real round trip, so any save or start sample replaces it. */
const STATE_CLOCK_RTT = 60_000;

function safeLocalStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Call on the start page with the `/api/attempts/start` result, before
 * navigating to the runner, so the timer uses the start's `serverNow`
 * (LLD §14.2). `sentAt`/`receivedAt` are `Date.now()` around the request.
 */
export function recordAttemptStart(
  attemptId: string,
  serverNow: number,
  sentAt: number,
  receivedAt: number,
): boolean {
  return rememberStartClock(safeLocalStorage(), attemptId, serverNow, sentAt, receivedAt);
}

/**
 * Exam runner state (LLD §7.2, §14.2, EX-11). Client only (the runner page
 * is `ssr: false`). Wraps `useNuxtApp().$convex`; the queue, cache and merge
 * logic live in `~/lib/attemptSync`.
 *
 * - `paper` is loaded once; `getState` is a live subscription merged into
 *   the local cache (server wins once submitted or expired).
 * - `setAnswer` / `toggleFlag` write to `localStorage` first, then save;
 *   pass `{ debounce: true }` for text input (400 ms).
 * - `remainingMs` ticks every second from `deadline` and the server clock
 *   offset, so a refresh doesn't reset the timer.
 */
export function useAttempt(attemptIdInput: string) {
  const attemptId = attemptIdInput as Id<"attempts">;
  const { $convex } = useNuxtApp();
  const { token } = useAnonIdentity();
  const storage = import.meta.client ? safeLocalStorage() : null;

  const paper = shallowRef<AttemptPaper | null>(null);
  const loadError = ref<string | null>(null);
  const serverStatus = ref<AttemptStatus | null>(null);
  const startedAt = ref<number | null>(null);
  const deadline = ref<number | null>(null);
  const currentIndex = ref(0);
  const snap = shallowRef<SyncSnapshot>();
  const now = ref(Date.now());

  let wsConnected = true;
  let browserOnline = import.meta.client ? navigator.onLine : true;

  const sync = new AttemptSync({
    attemptId,
    storage,
    online: browserOnline,
    onChange: (s) => (snap.value = s),
    save: async (req) => {
      const anonToken = token.value;
      if (!anonToken) throw new Error("NO_TOKEN");
      const res = await $convex.mutation(api.attempts.saveResponse, {
        attemptId,
        anonToken,
        questionId: req.questionId as Id<"questions">,
        flagged: req.flagged,
        clientUpdatedAt: req.clientUpdatedAt,
        ...(req.value !== undefined ? { value: req.value } : {}),
      });
      return { savedAt: res.savedAt, applied: res.applied };
    },
  });
  snap.value = sync.snapshot();

  function updateOnline() {
    sync.setOnline(browserOnline && wsConnected);
  }

  const cleanups: (() => void)[] = [];

  if (import.meta.client) {
    const onOnline = () => {
      browserOnline = true;
      updateOnline();
      void sync.flush();
    };
    const onOffline = () => {
      browserOnline = false;
      updateOnline();
    };
    // Leaving or hiding the tab: send debounced input now.
    const onHide = () => {
      if (document.visibilityState === "hidden") void sync.flush();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    cleanups.push(() => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    });

    let wasConnected = $convex.connectionState().isWebSocketConnected;
    cleanups.push(
      $convex.subscribeToConnectionState((s) => {
        // Only react to changes: before the first connect, don't pause saves
        // (the Convex client queues them until the socket opens).
        if (s.isWebSocketConnected === wasConnected) return;
        wasConnected = s.isWebSocketConnected;
        wsConnected = s.isWebSocketConnected || !s.hasEverConnected;
        updateOnline();
      }),
    );

    const tick = setInterval(() => (now.value = Date.now()), 1000);
    cleanups.push(() => clearInterval(tick));
  }

  function applyState(state: FunctionReturnType<typeof api.attempts.getState>, receivedAt: number) {
    serverStatus.value = state.status;
    startedAt.value = state.startedAt;
    deadline.value = state.deadline;
    // A query's `serverNow` may come from a cached result: use it only when
    // nothing better is known.
    if (!sync.hasClockSample) {
      sync.observeClock({
        offset: state.serverNow - receivedAt,
        rtt: STATE_CLOCK_RTT,
        at: receivedAt,
      });
    }
    sync.mergeServer(state);
    if (state.status !== "in_progress") sync.clearCache();
  }

  let unsubscribe: (() => void) | null = null;
  function load(anonToken: string) {
    unsubscribe?.();
    loadError.value = null;
    const args = { attemptId, anonToken };
    $convex.query(api.attempts.getPaper, args).then(
      (p) => (paper.value = p),
      (err: unknown) => (loadError.value = errorCodeOf(err) ?? "NETWORK"),
    );
    const sub = $convex.onUpdate(
      api.attempts.getState,
      args,
      (state) => applyState(state, Date.now()),
      (err) => (loadError.value = errorCodeOf(err) ?? "NETWORK"),
    );
    unsubscribe = () => sub();
  }

  if (import.meta.client) {
    watch(
      token,
      (t) => {
        if (t) load(t);
      },
      { immediate: true },
    );
  }

  onScopeDispose(() => {
    for (const fn of cleanups) fn();
    unsubscribe?.();
    // Unsent changes stay in the cache and are resent next time.
    void sync.flush().finally(() => sync.dispose());
  });

  const responses = computed<ResponseMap>(() => snap.value?.responses ?? {});
  const answers = computed(() => {
    const out: Record<string, AnswerValue | undefined> = {};
    for (const [id, s] of Object.entries(responses.value)) out[id] = s.value;
    return out;
  });
  const flags = computed(() => {
    const out: Record<string, boolean> = {};
    for (const [id, s] of Object.entries(responses.value)) if (s.flagged) out[id] = true;
    return out;
  });
  const clockOffset = computed(() => snap.value?.clockOffset ?? 0);
  const remainingMs = computed(() =>
    deadline.value === null ? null : Math.max(0, deadline.value - (now.value + clockOffset.value)),
  );
  const readOnly = computed(
    () =>
      (serverStatus.value !== null && serverStatus.value !== "in_progress") ||
      snap.value?.status !== "open",
  );
  const pendingCount = computed(() => snap.value?.pending.length ?? 0);

  function setAnswer(questionId: string, value: AnswerValue | null, opts?: { debounce?: boolean }) {
    return sync.setAnswer(questionId, value, opts);
  }

  /**
   * Flush, then submit. Throws `SavesPendingError` if answers are still
   * unsaved, unless `force` (the timer at 0:00 forces). Convex errors
   * propagate (`ATTEMPT_CLOSED` once the timer has already submitted).
   */
  async function submit(opts: { force?: boolean } = {}) {
    const anonToken = token.value;
    if (!anonToken) throw new Error("NO_TOKEN");
    const saved = await sync.flush();
    if (!saved && !opts.force) throw new SavesPendingError(sync.pendingCount);
    const result = await $convex.mutation(api.attempts.submit, { attemptId, anonToken });
    serverStatus.value = "submitted";
    sync.close();
    sync.clearCache();
    return result;
  }

  return {
    attemptId,
    paper,
    loadError,
    /** Server status from `getState`; null until it loads. */
    status: serverStatus,
    readOnly,
    startedAt,
    deadline,
    remainingMs,
    clockOffset,
    /** Current time on the server's clock (estimate). */
    serverNow: () => sync.serverNow(),
    currentIndex,
    responses,
    answers,
    flags,
    saving: computed(() => snap.value?.saving ?? false),
    online: computed(() => snap.value?.online ?? true),
    persistent: computed(() => snap.value?.persistent ?? false),
    pendingCount,
    saveError: computed(() => snap.value?.lastError ?? null),
    syncStatus: computed(() => snap.value?.status ?? "open"),
    setAnswer,
    setFlag: (questionId: string, flagged: boolean) => sync.setFlag(questionId, flagged),
    toggleFlag: (questionId: string) => sync.toggleFlag(questionId),
    flush: () => sync.flush(),
    submit,
  };
}
