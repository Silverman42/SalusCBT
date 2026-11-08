import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from "vue";
import type { useAttempt } from "~/composables/useAttempt";
import { errorCodeOf } from "~/lib/attemptSync";
import {
  announcement,
  dismissAlert,
  EMPTY_PACING_STATE,
  pacingStorageKey,
  parsePacingState,
  stepPacing,
  TIME_UP_RETRY_MS,
  TIME_UP_SUBMIT_TIMEOUT_MS,
  timeUpStep,
  type AlertId,
  type PacingState,
  type TimeUpEvent,
  type TimeUpPhase,
} from "~/lib/pacing";

type Attempt = ReturnType<typeof useAttempt>;

/**
 * Time calls, pacing alerts and the 0:00 submit for the runner (T-214,
 * LLD §14.2–14.3). Pure rules live in `~/lib/pacing`; this wires them to
 * `useAttempt`'s clock and `sessionStorage`.
 *
 * `onClosed` runs once when the attempt is submitted or expired (by the
 * 0:00 submit, the server's `autoSubmit`, the sweep or another tab).
 */
export function useExamTimer(
  attempt: Attempt,
  opts: { currentLabel: Ref<string | undefined>; onClosed: () => void },
) {
  const { attemptId, paper, status, startedAt, deadline, remainingMs, responses } = attempt;
  const key = pacingStorageKey(attemptId);

  // --- pacing ---------------------------------------------------------------

  const pacing = shallowRef<PacingState>(load());
  /** Text for the assertive live region; set once per firing. */
  const announcementText = ref("");
  let clearAnnouncement: ReturnType<typeof setTimeout> | undefined;

  function load(): PacingState {
    try {
      return parsePacingState(sessionStorage.getItem(key));
    } catch {
      return EMPTY_PACING_STATE;
    }
  }
  function save(s: PacingState) {
    pacing.value = s;
    try {
      sessionStorage.setItem(key, JSON.stringify(s));
    } catch {
      // Storage blocked: alerts may repeat after a refresh.
    }
  }

  const durationMs = computed(() =>
    startedAt.value !== null && deadline.value !== null ? deadline.value - startedAt.value : null,
  );

  function announce(text: string) {
    announcementText.value = text;
    clearTimeout(clearAnnouncement);
    // Clear later so the same text could be announced again if ever needed.
    clearAnnouncement = setTimeout(() => (announcementText.value = ""), 10_000);
  }

  watch(
    remainingMs,
    (remaining) => {
      const p = paper.value;
      const d = durationMs.value;
      if (!p || d === null || remaining === null || remaining <= 0) return;
      if (status.value !== "in_progress") return;
      const { state, fired } = stepPacing(pacing.value, {
        durationMs: d,
        elapsedMs: d - remaining,
        questions: p.questions,
        responses: responses.value,
        currentLabel: opts.currentLabel.value,
      });
      if (state === pacing.value) return;
      save(state);
      if (fired.length) announce(announcement(fired));
    },
    { immediate: true },
  );

  function dismiss(id: AlertId) {
    save(dismissAlert(pacing.value, id));
  }

  // --- 0:00 ------------------------------------------------------------------

  const phase = ref<TimeUpPhase>("running");
  let submitTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setInterval> | undefined;

  function send(event: TimeUpEvent) {
    const { phase: nextPhase, effect } = timeUpStep(phase.value, event);
    const was = phase.value;
    phase.value = nextPhase;
    if (was === "running" && nextPhase === "submitting")
      announce("Time is up. Submitting your exam.");
    if (was !== "waiting" && nextPhase === "waiting") {
      announce("Couldn't reach the server. It will submit your exam automatically.");
    }
    if (nextPhase === "waiting" && !retryTimer) {
      retryTimer = setInterval(() => send({ type: "retry" }), TIME_UP_RETRY_MS);
    }
    if (nextPhase === "closed") stopTimers();
    if (effect === "submit") runSubmit();
    if (effect === "redirect") opts.onClosed();
  }

  function runSubmit() {
    clearTimeout(submitTimer);
    // Offline, the Convex client queues the mutation and the promise waits.
    submitTimer = setTimeout(() => send({ type: "timeout" }), TIME_UP_SUBMIT_TIMEOUT_MS);
    attempt.submit({ force: true }).then(
      () => send({ type: "submitted" }),
      (err: unknown) => send({ type: "failed", code: errorCodeOf(err) ?? null }),
    );
  }

  function stopTimers() {
    clearTimeout(submitTimer);
    clearInterval(retryTimer);
    retryTimer = undefined;
  }

  watch(
    [remainingMs, status],
    ([remaining, s]) => send({ type: "tick", remainingMs: remaining, status: s }),
    { immediate: true },
  );

  onScopeDispose(() => {
    stopTimers();
    clearTimeout(clearAnnouncement);
  });

  return {
    phase,
    /** 0:00 reached on this page: answers can't change any more. */
    timeUp: computed(() => phase.value === "submitting" || phase.value === "waiting"),
    alerts: computed(() => pacing.value.active),
    announcement: announcementText,
    dismiss,
  };
}
