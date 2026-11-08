/**
 * Exam runner sync: local cache, save queue and server merge (LLD §7.2,
 * §14.2, PRD EX-11).
 *
 * Plain TypeScript with no Nuxt, Vue or DOM dependencies: the transport,
 * clock and storage are injected, so the whole thing runs in node tests.
 * `app/composables/useAttempt.ts` is a thin reactive wrapper over this.
 *
 * Model:
 * - `responses` holds each question's whole state `{ value?, flagged,
 *   updatedAt }`. `updatedAt` is the change time in server-clock ms
 *   (`Date.now() + clockOffset`), sent as `clientUpdatedAt` so the server
 *   can refuse a late retry that would overwrite a newer answer.
 * - The queue is the set of question ids whose local state the server has
 *   not confirmed. A send always carries the question's current state, so
 *   several changes to one question coalesce into one save (latest wins).
 * - Every change is written to `localStorage["salus.attempt.<id>"]` first
 *   (responses, queue and clock estimate; never the anon token), so a
 *   refresh restores answers and unsent saves. Blocked or full storage
 *   falls back to memory.
 * - Transient failures retry with exponential backoff and jitter; the queue
 *   pauses while offline and flushes on reconnect. `ATTEMPT_CLOSED` closes
 *   the runner (read-only) and `BAD_TOKEN` stops the queue.
 */
import type { AnswerValue } from "../../shared/content";

export const CACHE_PREFIX = "salus.attempt.";
export const CACHE_VERSION = 1;
/** LLD §7.2: text input is sent 400 ms after the last keystroke. */
export const TEXT_DEBOUNCE_MS = 400;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
/** A save that hasn't settled by then counts as failed and is retried. */
export const SEND_TIMEOUT_MS = 15_000;
/** Other attempts' caches older than this may be evicted when storage is full. */
export const STALE_CACHE_MS = 24 * 60 * 60 * 1000;
/** A clock sample this old is replaced by any newer save sample. */
const CLOCK_SAMPLE_TTL_MS = 10 * 60 * 1000;
/** `flush` gives up after this many rounds (someone typing during a flush). */
const FLUSH_ROUNDS = 5;

export type QuestionState = { value?: AnswerValue; flagged: boolean; updatedAt: number };
export type ResponseMap = Record<string, QuestionState>;

export type AttemptStatus = "in_progress" | "submitted" | "expired";

/** `open`: saves accepted. `closed`: read-only (submitted, expired or `ATTEMPT_CLOSED`). `stopped`: `BAD_TOKEN`. */
export type SyncStatus = "open" | "closed" | "stopped";

export interface SaveRequest {
  questionId: string;
  value?: AnswerValue;
  flagged: boolean;
  clientUpdatedAt: number;
}

export interface SaveResult {
  savedAt: number;
  applied: boolean;
}

export type SaveTransport = (req: SaveRequest) => Promise<SaveResult>;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The subset of Web Storage used here. `key`/`length` enable eviction when full. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> &
  Partial<Pick<Storage, "key" | "length">>;

export type SaveErrorKind = "closed" | "stop" | "drop" | "retry";

export interface ServerResponse {
  questionId: string;
  value?: AnswerValue | null;
  flagged: boolean;
  updatedAt: number;
}

export interface ServerState {
  status: AttemptStatus;
  responses: ServerResponse[];
}

export interface SyncSnapshot {
  status: SyncStatus;
  responses: ResponseMap;
  /** Question ids with unconfirmed changes (queued or in flight). */
  pending: string[];
  /** A save is in flight. */
  saving: boolean;
  online: boolean;
  /** false when the cache can't be written; answers then live in memory only. */
  persistent: boolean;
  /** Last save error code (or "NETWORK"); cleared by the next successful save. */
  lastError: string | null;
  clockOffset: number;
}

export interface AttemptSyncOptions {
  attemptId: string;
  save: SaveTransport;
  storage?: StorageLike | null;
  clock?: Clock;
  random?: () => number;
  classifyError?: (err: unknown) => SaveErrorKind;
  online?: boolean;
  debounceMs?: number;
  sendTimeoutMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  onChange?: (snapshot: SyncSnapshot) => void;
  /** The server kept a newer state than the one sent (`applied: false`). */
  onStale?: (questionId: string) => void;
}

/** The stored cache. No anon token: the token lives only in `salus.anon.v1`. */
export interface AttemptCache {
  v: typeof CACHE_VERSION;
  responses: ResponseMap;
  pending: string[];
  clock?: ClockSample;
  savedAt: number;
}

export interface ClockSample {
  /** serverTime − local time, ms. */
  offset: number;
  /** Round trip of the sample, ms; smaller is better. */
  rtt: number;
  /** Local time the sample was taken. */
  at: number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function cacheKey(attemptId: string): string {
  return CACHE_PREFIX + attemptId;
}

/** The §16 code of a Convex error (`ConvexError` data is the code or `{ code }`), else null. */
export function errorCodeOf(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("data" in err)) return null;
  const data: unknown = (err as { data: unknown }).data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && typeof (data as { code?: unknown }).code === "string") {
    return (data as { code: string }).code;
  }
  return null;
}

export function classifySaveError(err: unknown): SaveErrorKind {
  switch (errorCodeOf(err)) {
    case "ATTEMPT_CLOSED":
      return "closed";
    case "BAD_TOKEN":
      return "stop";
    case "NOT_FOUND":
    case "VALIDATION_FAILED":
      // Retrying the same payload can't succeed; keep it locally, stop sending it.
      return "drop";
    default:
      return "retry";
  }
}

/** Same rule as the server: a blank answer is stored as no answer. */
export function isBlankAnswer(value: AnswerValue): boolean {
  switch (value.kind) {
    case "mcq":
      return value.optionIds.length === 0;
    case "pbq":
      return Object.values(value.parts).every((a) =>
        Array.isArray(a) ? a.every((s) => s === "") : a === "",
      );
    case "firewall":
      return value.rules.every((r) => r.port === null && r.action === null);
  }
}

function normaliseValue(value: AnswerValue | null | undefined): AnswerValue | undefined {
  return value == null || isBlankAnswer(value) ? undefined : value;
}

export function isEmptyState(s: QuestionState | undefined): boolean {
  return !s || (s.value === undefined && !s.flagged);
}

/** Same answer and flag (ignores `updatedAt`). */
export function sameContent(a: QuestionState | undefined, b: QuestionState | undefined): boolean {
  if (isEmptyState(a) && isEmptyState(b)) return true;
  if (!a || !b || a.flagged !== b.flagged) return false;
  return JSON.stringify(a.value ?? null) === JSON.stringify(b.value ?? null);
}

/** Clock offset from a round trip, assuming the server stamped the midpoint. */
export function clockSample(serverTime: number, sentAt: number, receivedAt: number): ClockSample {
  return {
    offset: serverTime - (sentAt + receivedAt) / 2,
    rtt: Math.max(0, receivedAt - sentAt),
    at: receivedAt,
  };
}

/** Keep the more trustworthy sample: smaller round trip, unless the current one is stale. */
export function betterSample(
  current: ClockSample | undefined,
  next: ClockSample,
  now: number,
): ClockSample {
  if (!current) return next;
  if (now - current.at > CLOCK_SAMPLE_TTL_MS) return next;
  return next.rtt <= current.rtt ? next : current;
}

/** Delay before retry number `failures` (1-based): base·2^(n−1), capped, with ±25 % jitter. */
export function backoffDelay(
  failures: number,
  random: () => number = Math.random,
  baseMs = BACKOFF_BASE_MS,
  maxMs = BACKOFF_MAX_MS,
): number {
  const raw = Math.min(maxMs, baseMs * 2 ** Math.max(0, failures - 1));
  return Math.round(raw * (0.75 + random() * 0.5));
}

function isQuestionState(x: unknown): x is QuestionState {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.flagged === "boolean" &&
    typeof s.updatedAt === "number" &&
    Number.isFinite(s.updatedAt) &&
    (s.value === undefined || (typeof s.value === "object" && s.value !== null))
  );
}

function isClockSample(x: unknown): x is ClockSample {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return [s.offset, s.rtt, s.at].every((n) => typeof n === "number" && Number.isFinite(n));
}

/** Read and validate a cache; malformed parts are dropped, never thrown. */
export function readCache(
  storage: StorageLike | null | undefined,
  attemptId: string,
): AttemptCache | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(cacheKey(attemptId));
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (p.v !== CACHE_VERSION) return null;
  const responses: ResponseMap = {};
  if (p.responses && typeof p.responses === "object") {
    for (const [id, s] of Object.entries(p.responses as Record<string, unknown>)) {
      if (isQuestionState(s)) responses[id] = s;
    }
  }
  const pending = Array.isArray(p.pending)
    ? p.pending.filter((id): id is string => typeof id === "string" && id in responses)
    : [];
  return {
    v: CACHE_VERSION,
    responses,
    pending,
    ...(isClockSample(p.clock) ? { clock: p.clock } : {}),
    savedAt: typeof p.savedAt === "number" ? p.savedAt : 0,
  };
}

/** Remove other attempts' caches not written for a day. Returns how many went. */
export function evictStaleCaches(storage: StorageLike, keepKey: string, now: number): number {
  if (typeof storage.key !== "function" || typeof storage.length !== "number") return 0;
  const victims: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || key === keepKey || !key.startsWith(CACHE_PREFIX)) continue;
    let savedAt = 0;
    try {
      const v = JSON.parse(storage.getItem(key) ?? "null") as { savedAt?: unknown } | null;
      savedAt = typeof v?.savedAt === "number" ? v.savedAt : 0;
    } catch {
      // Unreadable: treat as stale.
    }
    if (now - savedAt > STALE_CACHE_MS) victims.push(key);
  }
  for (const key of victims) {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore.
    }
  }
  return victims.length;
}

/** Write a cache; on a full store, evict stale attempt caches once and retry. */
export function writeCache(storage: StorageLike | null | undefined, key: string, value: string) {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    try {
      if (evictStaleCaches(storage, key, Date.now()) === 0) return false;
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Store the clock sample from `/api/attempts/start` (its `serverNow`) before
 * navigating to the runner, so the timer is right before the first save.
 */
export function rememberStartClock(
  storage: StorageLike | null | undefined,
  attemptId: string,
  serverNow: number,
  sentAt: number,
  receivedAt: number,
): boolean {
  const existing = readCache(storage, attemptId);
  const cache: AttemptCache = {
    v: CACHE_VERSION,
    responses: existing?.responses ?? {},
    pending: existing?.pending ?? [],
    clock: clockSample(serverNow, sentAt, receivedAt),
    savedAt: receivedAt,
  };
  return writeCache(storage, cacheKey(attemptId), JSON.stringify(cache));
}

export function removeCache(storage: StorageLike | null | undefined, attemptId: string) {
  try {
    storage?.removeItem(cacheKey(attemptId));
  } catch {
    // Ignore.
  }
}

type Pending = { notBefore: number };
type InFlight = { updatedAt: number; promise: Promise<boolean> };

export class AttemptSync {
  readonly attemptId: string;
  private readonly saveFn: SaveTransport;
  private readonly storage: StorageLike | null;
  private readonly clock: Clock;
  private readonly random: () => number;
  private readonly classify: (err: unknown) => SaveErrorKind;
  private readonly debounceMs: number;
  private readonly sendTimeoutMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly onChange?: (s: SyncSnapshot) => void;
  private readonly onStale?: (questionId: string) => void;

  private responses = new Map<string, QuestionState>();
  private pending = new Map<string, Pending>();
  private inflight = new Map<string, InFlight>();
  private status: SyncStatus = "open";
  private online: boolean;
  private persistent: boolean;
  private lastError: string | null = null;
  private clockSampleValue: ClockSample | undefined;
  /** Server-clock offset, ms; refined from save round trips. */
  private offset = 0;
  private failures = 0;
  private retryAt = 0;
  private timer: unknown = null;
  private timerAt = Infinity;
  private disposed = false;

  constructor(opts: AttemptSyncOptions) {
    this.attemptId = opts.attemptId;
    this.saveFn = opts.save;
    this.storage = opts.storage ?? null;
    this.clock = opts.clock ?? systemClock;
    this.random = opts.random ?? Math.random;
    this.classify = opts.classifyError ?? classifySaveError;
    this.online = opts.online ?? true;
    this.debounceMs = opts.debounceMs ?? TEXT_DEBOUNCE_MS;
    this.sendTimeoutMs = opts.sendTimeoutMs ?? SEND_TIMEOUT_MS;
    this.backoffBaseMs = opts.backoffBaseMs ?? BACKOFF_BASE_MS;
    this.backoffMaxMs = opts.backoffMaxMs ?? BACKOFF_MAX_MS;
    this.onChange = opts.onChange;
    this.onStale = opts.onStale;
    this.persistent = this.storage !== null;

    const cache = readCache(this.storage, this.attemptId);
    if (cache) {
      for (const [id, s] of Object.entries(cache.responses)) this.responses.set(id, s);
      for (const id of cache.pending) this.pending.set(id, { notBefore: 0 });
      if (cache.clock) this.useClockSample(cache.clock);
    }
    this.schedule();
  }

  // ---- reads ---------------------------------------------------------------

  /** Current time on the server's clock (estimate). */
  serverNow(): number {
    return this.clock.now() + this.offset;
  }

  get clockOffset(): number {
    return this.offset;
  }

  /** A clock estimate exists (from the start route, the cache or a save). */
  get hasClockSample(): boolean {
    return this.clockSampleValue !== undefined;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  get(questionId: string): QuestionState | undefined {
    return this.responses.get(questionId);
  }

  snapshot(): SyncSnapshot {
    return {
      status: this.status,
      responses: Object.fromEntries(this.responses),
      pending: [...this.pending.keys()],
      saving: this.inflight.size > 0,
      online: this.online,
      persistent: this.persistent,
      lastError: this.lastError,
      clockOffset: this.offset,
    };
  }

  // ---- changes -------------------------------------------------------------

  /** Set (or clear, with `null`/blank) an answer. Returns false when read-only. */
  setAnswer(questionId: string, value: AnswerValue | null, opts: { debounce?: boolean } = {}) {
    return this.change(questionId, { value: normaliseValue(value) }, opts.debounce ?? false);
  }

  setFlag(questionId: string, flagged: boolean) {
    return this.change(questionId, { flagged }, false);
  }

  toggleFlag(questionId: string) {
    return this.setFlag(questionId, !(this.responses.get(questionId)?.flagged ?? false));
  }

  private change(
    questionId: string,
    patch: Partial<Pick<QuestionState, "value" | "flagged">>,
    debounce: boolean,
  ): boolean {
    if (this.status !== "open" || this.disposed) return false;
    const prev = this.responses.get(questionId);
    const next: QuestionState = {
      flagged: patch.flagged ?? prev?.flagged ?? false,
      // Monotonic per question even if the offset estimate moves backwards.
      updatedAt: Math.max((prev?.updatedAt ?? 0) + 1, Math.round(this.serverNow())),
    };
    const value = "value" in patch ? patch.value : prev?.value;
    if (value !== undefined) next.value = value;
    if (prev && sameContent(prev, next)) return true;
    this.responses.set(questionId, next);
    // A click sends now, taking any debounced keystroke on this question with it.
    this.pending.set(questionId, { notBefore: debounce ? this.clock.now() + this.debounceMs : 0 });
    this.persist();
    this.emit();
    this.schedule();
    return true;
  }

  // ---- connectivity --------------------------------------------------------

  setOnline(online: boolean) {
    if (this.online === online) return;
    this.online = online;
    if (online) {
      // Reconnected: retry right away instead of waiting out the backoff.
      this.retryAt = 0;
      this.failures = 0;
    }
    this.emit();
    this.schedule();
  }

  /**
   * Send everything now, ignoring debounce and backoff. Resolves true when
   * nothing is left unconfirmed; false if a save failed, the runner is
   * closed, or it's offline.
   */
  async flush(): Promise<boolean> {
    this.retryAt = 0;
    for (const p of this.pending.values()) p.notBefore = 0;
    for (let round = 0; round < FLUSH_ROUNDS; round++) {
      if (this.status !== "open" || !this.online || this.disposed) break;
      const ids = [...new Set([...this.pending.keys(), ...this.inflight.keys()])];
      if (ids.length === 0) break;
      const results = await Promise.all(
        ids.map((id) => this.inflight.get(id)?.promise ?? this.send(id)),
      );
      if (results.some((ok) => !ok)) break;
    }
    return this.pending.size === 0 && this.inflight.size === 0;
  }

  // ---- server state --------------------------------------------------------

  /**
   * Merge a `getState` result (LLD §14.2). Submitted or expired: the server
   * wins outright and the runner goes read-only. In progress: per question,
   * the newer `updatedAt` wins (a tie goes to the server, which is
   * confirmed); a local state the server lacks is queued again.
   */
  mergeServer(state: ServerState) {
    if (this.disposed) return;
    const server = new Map<string, QuestionState>();
    for (const r of state.responses) {
      const s: QuestionState = { flagged: r.flagged, updatedAt: r.updatedAt };
      const value = normaliseValue(r.value);
      if (value !== undefined) s.value = value;
      server.set(r.questionId, s);
    }

    if (state.status !== "in_progress") {
      // The server is the record now; the caller may drop the cache.
      this.responses = server;
      this.pending.clear();
      this.close();
      return;
    }

    for (const id of new Set([...server.keys(), ...this.responses.keys()])) {
      const s = server.get(id);
      const l = this.responses.get(id);
      if (!l) {
        if (s) this.responses.set(id, s);
        continue;
      }
      if (!s) {
        if (!isEmptyState(l) && !this.pending.has(id)) this.pending.set(id, { notBefore: 0 });
        continue;
      }
      if (sameContent(l, s)) {
        this.responses.set(id, { ...l, updatedAt: Math.max(l.updatedAt, s.updatedAt) });
        if (!this.inflight.has(id)) this.pending.delete(id);
      } else if (s.updatedAt >= l.updatedAt) {
        this.responses.set(id, s);
        this.pending.delete(id);
      } else if (!this.pending.has(id)) {
        this.pending.set(id, { notBefore: 0 });
      }
    }
    this.persist();
    this.emit();
    this.schedule();
  }

  /** Add a clock estimate taken elsewhere (start route, `getState.serverNow`). */
  observeClock(sample: ClockSample) {
    this.useClockSample(betterSample(this.clockSampleValue, sample, this.clock.now()));
    this.persist();
    this.emit();
  }

  /** Go read-only and stop sending (submitted, expired, or closed by the server). */
  close() {
    if (this.status === "open") this.status = "closed";
    this.clearTimer();
    this.emit();
  }

  /** Forget the local cache (after a confirmed submit: the server is the record). */
  clearCache() {
    removeCache(this.storage, this.attemptId);
  }

  dispose() {
    this.disposed = true;
    this.clearTimer();
  }

  // ---- internals -----------------------------------------------------------

  private useClockSample(sample: ClockSample) {
    this.clockSampleValue = sample;
    this.offset = Math.round(sample.offset);
  }

  private emit() {
    this.onChange?.(this.snapshot());
  }

  private persist() {
    if (!this.storage) return;
    const cache: AttemptCache = {
      v: CACHE_VERSION,
      responses: Object.fromEntries(this.responses),
      pending: [...new Set([...this.pending.keys(), ...this.inflight.keys()])],
      ...(this.clockSampleValue ? { clock: this.clockSampleValue } : {}),
      savedAt: this.clock.now(),
    };
    const ok = writeCache(this.storage, cacheKey(this.attemptId), JSON.stringify(cache));
    if (ok !== this.persistent) this.persistent = ok;
  }

  private clearTimer() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.timerAt = Infinity;
  }

  /** Send what's due now; set one timer for the next due item. */
  private schedule() {
    if (this.status !== "open" || !this.online || this.disposed) {
      this.clearTimer();
      return;
    }
    const now = this.clock.now();
    let next = Infinity;
    for (const [id, p] of this.pending) {
      if (this.inflight.has(id)) continue;
      const due = Math.max(p.notBefore, this.retryAt);
      if (due <= now) void this.send(id);
      else next = Math.min(next, due);
    }
    if (next === this.timerAt) return;
    this.clearTimer();
    if (next !== Infinity) {
      this.timerAt = next;
      this.timer = this.clock.setTimeout(() => {
        this.timer = null;
        this.timerAt = Infinity;
        this.schedule();
      }, next - now);
    }
  }

  /** Send a question's current state. Resolves true if it settled (applied or not). */
  private send(questionId: string): Promise<boolean> {
    const state = this.responses.get(questionId);
    if (!state || this.status !== "open") {
      this.pending.delete(questionId);
      return Promise.resolve(this.status === "open");
    }
    const req: SaveRequest = {
      questionId,
      flagged: state.flagged,
      clientUpdatedAt: state.updatedAt,
      ...(state.value !== undefined ? { value: state.value } : {}),
    };
    const sentAt = this.clock.now();
    let call: Promise<SaveResult>;
    try {
      call = this.saveFn(req);
    } catch (err) {
      call = Promise.reject(err);
    }
    const promise = this.withTimeout(call).then(
      (res) => this.onSaved(questionId, state.updatedAt, res, sentAt),
      (err: unknown) => this.onFailed(questionId, state.updatedAt, err),
    );
    this.inflight.set(questionId, { updatedAt: state.updatedAt, promise });
    this.emit();
    return promise;
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const h = this.clock.setTimeout(() => reject(new Error("SEND_TIMEOUT")), this.sendTimeoutMs);
      p.then(
        (v) => {
          this.clock.clearTimeout(h);
          resolve(v);
        },
        (e: unknown) => {
          this.clock.clearTimeout(h);
          reject(e);
        },
      );
    });
  }

  /** Drop the queue entry if nothing changed since this send. */
  private settle(questionId: string, sentUpdatedAt: number) {
    this.inflight.delete(questionId);
    if (this.responses.get(questionId)?.updatedAt === sentUpdatedAt) {
      this.pending.delete(questionId);
    }
  }

  private onSaved(questionId: string, sentUpdatedAt: number, res: SaveResult, sentAt: number) {
    if (this.disposed) return true;
    const receivedAt = this.clock.now();
    this.clockSampleValue = betterSample(
      this.clockSampleValue,
      clockSample(res.savedAt, sentAt, receivedAt),
      receivedAt,
    );
    this.offset = Math.round(this.clockSampleValue.offset);
    this.failures = 0;
    this.retryAt = 0;
    this.lastError = null;
    this.settle(questionId, sentUpdatedAt);
    this.persist();
    this.emit();
    if (!res.applied) this.onStale?.(questionId);
    this.schedule();
    return true;
  }

  private onFailed(questionId: string, sentUpdatedAt: number, err: unknown) {
    if (this.disposed) return false;
    this.inflight.delete(questionId);
    const kind = this.classify(err);
    this.lastError = errorCodeOf(err) ?? "NETWORK";
    switch (kind) {
      case "closed":
        this.close();
        break;
      case "stop":
        this.status = "stopped";
        this.clearTimer();
        break;
      case "drop":
        this.settle(questionId, sentUpdatedAt);
        break;
      case "retry":
        this.failures++;
        this.retryAt =
          this.clock.now() +
          backoffDelay(this.failures, this.random, this.backoffBaseMs, this.backoffMaxMs);
        break;
    }
    this.persist();
    this.emit();
    this.schedule();
    return false;
  }
}
