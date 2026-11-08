import { describe, expect, it } from "vitest";
import {
  AttemptSync,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  CACHE_PREFIX,
  TEXT_DEBOUNCE_MS,
  backoffDelay,
  betterSample,
  cacheKey,
  classifySaveError,
  clockSample,
  errorCodeOf,
  evictStaleCaches,
  readCache,
  rememberStartClock,
  type AttemptSyncOptions,
  type Clock,
  type SaveRequest,
  type SaveResult,
  type StorageLike,
  type SyncSnapshot,
} from "../../app/lib/attemptSync";
import type { AnswerValue } from "../../shared/content";

const ID = "attempt1";
const mcq = (...optionIds: string[]): AnswerValue => ({ kind: "mcq", optionIds });
const text = (s: string): AnswerValue => ({ kind: "pbq", parts: { "1a": s } });

/** Fake clock with a manual timer queue. */
function fakeClock(start = 1_000_000): Clock & { advance(ms: number): Promise<void>; t: number } {
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock = {
    t: start,
    now: () => clock.t,
    setTimeout: (fn: () => void, ms: number) => {
      const id = ++seq;
      timers.set(id, { at: clock.t + ms, fn });
      return id;
    },
    clearTimeout: (h: unknown) => void timers.delete(h as number),
    async advance(ms: number) {
      const end = clock.t + ms;
      for (;;) {
        await settle();
        let next: [number, { at: number; fn: () => void }] | undefined;
        for (const e of timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
        if (!next) break;
        timers.delete(next[0]);
        clock.t = next[1].at;
        next[1].fn();
      }
      clock.t = end;
      await settle();
    },
  };
  return clock;
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

const blockedStorage: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

type Call = {
  req: SaveRequest;
  resolve: (r: SaveResult) => void;
  reject: (e: unknown) => void;
};

/** Transport whose calls are resolved by the test. */
function manualTransport() {
  const calls: Call[] = [];
  const save = (req: SaveRequest) =>
    new Promise<SaveResult>((resolve, reject) => calls.push({ req, resolve, reject }));
  return { calls, save };
}

/** Transport that succeeds at once, stamping `savedAt` with the server clock. */
function autoTransport(clock: Clock, serverOffset = 0) {
  const reqs: SaveRequest[] = [];
  const save = (req: SaveRequest) => {
    reqs.push(req);
    return Promise.resolve({ savedAt: clock.now() + serverOffset, applied: true });
  };
  return { reqs, save };
}

const convexError = (code: string) => Object.assign(new Error(code), { data: code });

function make(opts: Partial<AttemptSyncOptions> & Pick<AttemptSyncOptions, "save">) {
  const snaps: SyncSnapshot[] = [];
  const sync = new AttemptSync({
    attemptId: ID,
    random: () => 0.5,
    onChange: (s) => snaps.push(s),
    ...opts,
  });
  return { sync, snaps };
}

describe("helpers", () => {
  it("reads Convex error codes in both shapes", () => {
    expect(errorCodeOf(convexError("ATTEMPT_CLOSED"))).toBe("ATTEMPT_CLOSED");
    expect(errorCodeOf({ data: { code: "RATE_LIMITED", retryAfter: 5 } })).toBe("RATE_LIMITED");
    expect(errorCodeOf(new Error("x"))).toBeNull();
    expect(classifySaveError(convexError("ATTEMPT_CLOSED"))).toBe("closed");
    expect(classifySaveError(convexError("BAD_TOKEN"))).toBe("stop");
    expect(classifySaveError(convexError("NOT_FOUND"))).toBe("drop");
    expect(classifySaveError(convexError("VALIDATION_FAILED"))).toBe("drop");
    expect(classifySaveError(new TypeError("fetch failed"))).toBe("retry");
  });

  it("backs off exponentially with jitter and a cap", () => {
    const mid = () => 0.5;
    expect(backoffDelay(1, mid)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelay(2, mid)).toBe(2 * BACKOFF_BASE_MS);
    expect(backoffDelay(3, mid)).toBe(4 * BACKOFF_BASE_MS);
    expect(backoffDelay(50, mid)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(1, () => 0)).toBe(0.75 * BACKOFF_BASE_MS);
    expect(backoffDelay(1, () => 1)).toBe(1.25 * BACKOFF_BASE_MS);
  });

  it("estimates clock offset from a round trip and keeps the tightest sample", () => {
    const s = clockSample(5_100, 1_000, 1_200);
    expect(s).toEqual({ offset: 4_000, rtt: 200, at: 1_200 });
    const worse = { offset: 0, rtt: 900, at: 1_300 };
    expect(betterSample(s, worse, 1_300)).toBe(s);
    const better = { offset: 1, rtt: 50, at: 1_300 };
    expect(betterSample(s, better, 1_300)).toBe(better);
    // A stale sample is replaced even by a looser one.
    expect(betterSample(s, worse, 1_200 + 11 * 60_000)).toBe(worse);
  });
});

describe("AttemptSync: saving", () => {
  it("writes to storage before the save is sent", () => {
    const storage = memoryStorage();
    let cachedAtSend: string | undefined;
    const { sync } = make({
      storage,
      clock: fakeClock(),
      save: (req) => {
        cachedAtSend = storage.getItem(cacheKey(ID)) ?? undefined;
        return Promise.resolve({ savedAt: req.clientUpdatedAt, applied: true });
      },
    });
    sync.setAnswer("q1", mcq("A"));
    expect(cachedAtSend).toBeDefined();
    expect(JSON.parse(cachedAtSend!).responses.q1.value).toEqual(mcq("A"));
  });

  it("never stores the anon token in the attempt cache", async () => {
    const storage = memoryStorage();
    const clock = fakeClock();
    const { sync } = make({ storage, clock, save: autoTransport(clock).save });
    sync.setAnswer("q1", mcq("A"));
    await settle();
    const raw = storage.getItem(cacheKey(ID))!;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(
      ["clock", "pending", "responses", "savedAt", "v"].sort(),
    );
    expect(raw).not.toMatch(/token/i);
  });

  it("coalesces changes to one question while a save is in flight (latest wins)", async () => {
    const clock = fakeClock();
    const t = manualTransport();
    const { sync } = make({ clock, save: t.save });
    sync.setAnswer("q1", mcq("A"));
    sync.setAnswer("q1", mcq("B"));
    sync.toggleFlag("q1");
    sync.setAnswer("q1", mcq("C"));
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.req.value).toEqual(mcq("A"));

    t.calls[0]!.resolve({ savedAt: clock.now(), applied: true });
    await settle();
    // One follow-up save carrying the whole latest state.
    expect(t.calls).toHaveLength(2);
    expect(t.calls[1]!.req).toMatchObject({ value: mcq("C"), flagged: true });
    expect(sync.pendingCount).toBe(1);
    t.calls[1]!.resolve({ savedAt: clock.now(), applied: true });
    await settle();
    expect(t.calls).toHaveLength(2);
    expect(sync.pendingCount).toBe(0);
  });

  it("debounces text input 400 ms; a click sends at once and carries the text", async () => {
    const clock = fakeClock();
    const t = autoTransport(clock);
    const { sync } = make({ clock, save: t.save });
    sync.setAnswer("q1", text("1"), { debounce: true });
    await clock.advance(200);
    sync.setAnswer("q1", text("10"), { debounce: true });
    await clock.advance(TEXT_DEBOUNCE_MS - 1);
    expect(t.reqs).toHaveLength(0);
    await clock.advance(1);
    expect(t.reqs.map((r) => r.value)).toEqual([text("10")]);

    sync.setAnswer("q2", text("x"), { debounce: true });
    sync.toggleFlag("q2");
    await settle();
    expect(t.reqs[1]).toMatchObject({ questionId: "q2", value: text("x"), flagged: true });
  });

  it("sends clientUpdatedAt in server-clock ms, increasing per question", async () => {
    const clock = fakeClock(1_000_000);
    // Server clock is 5 s ahead of this device.
    const storage = memoryStorage();
    rememberStartClock(storage, ID, 1_005_000, 999_900, 1_000_100);
    const t = manualTransport();
    const { sync } = make({ clock, storage, save: t.save });
    expect(sync.clockOffset).toBe(5_000);
    sync.setAnswer("q1", mcq("A"));
    expect(t.calls[0]!.req.clientUpdatedAt).toBe(1_005_000);
    // Same millisecond: still strictly later.
    sync.setAnswer("q1", mcq("B"));
    t.calls[0]!.resolve({ savedAt: 1_005_000, applied: true });
    await settle();
    expect(t.calls[1]!.req.clientUpdatedAt).toBe(1_005_001);
  });

  it("refines the clock offset from save round trips", async () => {
    const clock = fakeClock(1_000_000);
    const { sync } = make({ clock, save: autoTransport(clock, 7_000).save });
    expect(sync.clockOffset).toBe(0);
    sync.setAnswer("q1", mcq("A"));
    await settle();
    expect(sync.clockOffset).toBe(7_000);
    expect(sync.serverNow()).toBe(1_007_000);
  });

  it("drops the entry when the server didn't apply it (it holds a newer state)", async () => {
    const clock = fakeClock();
    const stale: string[] = [];
    const { sync } = make({
      clock,
      save: () => Promise.resolve({ savedAt: clock.now(), applied: false }),
      onStale: (id) => stale.push(id),
    });
    sync.setAnswer("q1", mcq("A"));
    await settle();
    expect(sync.pendingCount).toBe(0);
    expect(stale).toEqual(["q1"]);
  });

  it("clears a blank answer to no value", async () => {
    const clock = fakeClock();
    const t = autoTransport(clock);
    const { sync } = make({ clock, save: t.save });
    sync.setAnswer("q1", mcq("A"));
    sync.setAnswer("q1", mcq());
    await settle();
    expect(t.reqs.at(-1)).not.toHaveProperty("value");
    expect(sync.get("q1")?.value).toBeUndefined();
  });
});

describe("AttemptSync: failures", () => {
  it("retries transient failures with backoff, then resets on success", async () => {
    const clock = fakeClock();
    const t = manualTransport();
    const { sync, snaps } = make({ clock, save: t.save });
    sync.setAnswer("q1", mcq("A"));
    t.calls[0]!.reject(new TypeError("network"));
    await settle();
    expect(snaps.at(-1)!.lastError).toBe("NETWORK");

    await clock.advance(BACKOFF_BASE_MS - 1);
    expect(t.calls).toHaveLength(1);
    await clock.advance(1);
    expect(t.calls).toHaveLength(2);

    t.calls[1]!.reject(new TypeError("network"));
    await clock.advance(2 * BACKOFF_BASE_MS - 1);
    expect(t.calls).toHaveLength(2);
    await clock.advance(1);
    expect(t.calls).toHaveLength(3);

    t.calls[2]!.resolve({ savedAt: clock.now(), applied: true });
    await settle();
    expect(sync.pendingCount).toBe(0);
    expect(snaps.at(-1)!.lastError).toBeNull();

    // Backoff was reset: the next failure waits the base delay again.
    sync.setAnswer("q2", mcq("B"));
    t.calls[3]!.reject(new TypeError("network"));
    await clock.advance(BACKOFF_BASE_MS);
    expect(t.calls).toHaveLength(5);
  });

  it("treats a save that never settles as failed and retries it", async () => {
    const clock = fakeClock();
    const t = manualTransport();
    const { sync } = make({ clock, save: t.save, sendTimeoutMs: 5_000 });
    sync.setAnswer("q1", mcq("A"));
    await clock.advance(5_000 + BACKOFF_BASE_MS);
    expect(t.calls).toHaveLength(2);
    expect(t.calls[1]!.req).toEqual(t.calls[0]!.req);
  });

  it("pauses while offline and flushes on reconnect", async () => {
    const clock = fakeClock();
    const t = autoTransport(clock);
    const { sync } = make({ clock, save: t.save, online: false });
    sync.setAnswer("q1", mcq("A"));
    sync.setAnswer("q2", mcq("B"));
    await clock.advance(60_000);
    expect(t.reqs).toHaveLength(0);
    expect(sync.pendingCount).toBe(2);
    expect(await sync.flush()).toBe(false);

    sync.setOnline(true);
    await settle();
    expect(t.reqs.map((r) => r.questionId).sort()).toEqual(["q1", "q2"]);
    expect(sync.pendingCount).toBe(0);
  });

  it("reconnecting skips the remaining backoff", async () => {
    const clock = fakeClock();
    const t = manualTransport();
    const { sync } = make({ clock, save: t.save, random: () => 1 });
    sync.setAnswer("q1", mcq("A"));
    for (let i = 0; i < 5; i++) {
      t.calls.at(-1)!.reject(new TypeError("network"));
      await clock.advance(BACKOFF_MAX_MS * 2);
    }
    t.calls.at(-1)!.reject(new TypeError("network"));
    await settle();
    const before = t.calls.length;
    sync.setOnline(false);
    sync.setOnline(true);
    await settle();
    expect(t.calls.length).toBe(before + 1);
  });

  it("ATTEMPT_CLOSED stops the queue and makes the runner read-only", async () => {
    const clock = fakeClock();
    const t = manualTransport();
    const { sync, snaps } = make({ clock, save: t.save });
    sync.setAnswer("q1", mcq("A"));
    sync.setAnswer("q2", mcq("B"));
    t.calls[0]!.reject(convexError("ATTEMPT_CLOSED"));
    await settle();
    expect(snaps.at(-1)!.status).toBe("closed");
    expect(sync.setAnswer("q3", mcq("C"))).toBe(false);
    expect(sync.get("q3")).toBeUndefined();
    await clock.advance(10 * BACKOFF_MAX_MS);
    expect(t.calls).toHaveLength(2);
    expect(await sync.flush()).toBe(false);
  });

  it("BAD_TOKEN stops the queue but keeps the changes", async () => {
    const clock = fakeClock();
    const t = manualTransport();
    const { sync, snaps } = make({ clock, save: t.save });
    sync.setAnswer("q1", mcq("A"));
    t.calls[0]!.reject(convexError("BAD_TOKEN"));
    await clock.advance(10 * BACKOFF_MAX_MS);
    expect(snaps.at(-1)!.status).toBe("stopped");
    expect(t.calls).toHaveLength(1);
    expect(sync.pendingCount).toBe(1);
  });

  it("drops a save the server rejects as invalid, without retrying", async () => {
    const clock = fakeClock();
    const t = manualTransport();
    const { sync, snaps } = make({ clock, save: t.save });
    sync.setAnswer("q1", mcq("Z"));
    t.calls[0]!.reject(convexError("VALIDATION_FAILED"));
    await clock.advance(10 * BACKOFF_MAX_MS);
    expect(t.calls).toHaveLength(1);
    expect(sync.pendingCount).toBe(0);
    expect(snaps.at(-1)!.lastError).toBe("VALIDATION_FAILED");
    expect(snaps.at(-1)!.status).toBe("open");
  });

  it("flush ignores debounce and backoff and reports success", async () => {
    const clock = fakeClock();
    let fail = true;
    const reqs: SaveRequest[] = [];
    const { sync } = make({
      clock,
      save: (req) => {
        reqs.push(req);
        return fail
          ? Promise.reject(new TypeError("network"))
          : Promise.resolve({ savedAt: clock.now(), applied: true });
      },
    });
    sync.setAnswer("q1", mcq("A"));
    await settle();
    sync.setAnswer("q2", text("abc"), { debounce: true });
    fail = false;
    expect(await sync.flush()).toBe(true);
    expect(reqs.map((r) => r.questionId)).toEqual(["q1", "q1", "q2"]);
  });
});

describe("AttemptSync: refresh and storage", () => {
  it("restores answers and the unsent queue after a refresh", async () => {
    const storage = memoryStorage();
    const clock = fakeClock();
    const first = make({ storage, clock, save: autoTransport(clock).save, online: false });
    first.sync.setAnswer("q1", mcq("A"));
    first.sync.toggleFlag("q2");
    first.sync.dispose();

    const t = autoTransport(clock);
    const second = make({ storage, clock, save: t.save });
    expect(second.sync.get("q1")?.value).toEqual(mcq("A"));
    expect(second.sync.get("q2")?.flagged).toBe(true);
    await settle();
    // The restored queue is sent on load.
    expect(t.reqs.map((r) => r.questionId).sort()).toEqual(["q1", "q2"]);
    expect(second.sync.pendingCount).toBe(0);
  });

  it("restores a save that was in flight at refresh", () => {
    const storage = memoryStorage();
    const clock = fakeClock();
    const first = make({ storage, clock, save: manualTransport().save });
    first.sync.setAnswer("q1", mcq("A"));
    const cache = readCache(storage, ID)!;
    expect(cache.pending).toEqual(["q1"]);
  });

  it("keeps the clock offset across a refresh, so the timer doesn't reset", async () => {
    const storage = memoryStorage();
    const clock = fakeClock(1_000_000);
    const first = make({ storage, clock, save: autoTransport(clock, -3_000).save });
    first.sync.setAnswer("q1", mcq("A"));
    await settle();
    expect(first.sync.clockOffset).toBe(-3_000);
    const second = make({ storage, clock, save: autoTransport(clock).save });
    expect(second.sync.clockOffset).toBe(-3_000);
    expect(second.sync.hasClockSample).toBe(true);
  });

  it("works in memory when storage is blocked", async () => {
    const clock = fakeClock();
    const t = autoTransport(clock);
    const { sync, snaps } = make({ storage: blockedStorage, clock, save: t.save });
    sync.setAnswer("q1", mcq("A"));
    await settle();
    expect(t.reqs).toHaveLength(1);
    expect(sync.get("q1")?.value).toEqual(mcq("A"));
    expect(snaps.at(-1)!.persistent).toBe(false);
  });

  it("evicts other stale attempt caches when storage is full", () => {
    const storage = memoryStorage();
    const now = Date.now();
    storage.setItem(CACHE_PREFIX + "old", JSON.stringify({ v: 1, savedAt: now - 2 * 86_400_000 }));
    storage.setItem(CACHE_PREFIX + "recent", JSON.stringify({ v: 1, savedAt: now }));
    storage.setItem("salus.anon.v1", "{}");
    let full = true;
    const setItem = storage.setItem;
    storage.setItem = (k, v) => {
      if (full && k === cacheKey(ID)) {
        full = false;
        throw new Error("QuotaExceededError");
      }
      setItem(k, v);
    };
    const { sync, snaps } = make({ storage, save: manualTransport().save });
    sync.setAnswer("q1", mcq("A"));
    expect(snaps.at(-1)!.persistent).toBe(true);
    expect(storage.getItem(CACHE_PREFIX + "old")).toBeNull();
    expect(storage.getItem(CACHE_PREFIX + "recent")).not.toBeNull();
    expect(storage.getItem("salus.anon.v1")).toBe("{}");
    expect(evictStaleCaches(storage, cacheKey(ID), now)).toBe(0);
  });

  it("ignores a corrupt or foreign cache", () => {
    const storage = memoryStorage();
    storage.setItem(cacheKey(ID), "{not json");
    expect(readCache(storage, ID)).toBeNull();
    storage.setItem(
      cacheKey(ID),
      JSON.stringify({
        v: 1,
        responses: { q1: { flagged: true, updatedAt: 5 }, q2: { flagged: "yes" } },
        pending: ["q1", "q2", 3],
      }),
    );
    expect(readCache(storage, ID)).toMatchObject({
      responses: { q1: { flagged: true, updatedAt: 5 } },
      pending: ["q1"],
    });
    storage.setItem(cacheKey(ID), JSON.stringify({ v: 99, responses: {} }));
    expect(readCache(storage, ID)).toBeNull();
  });
});

describe("AttemptSync: merging server state", () => {
  function seeded(responses: Record<string, unknown>, pending: string[] = []) {
    const storage = memoryStorage();
    storage.setItem(cacheKey(ID), JSON.stringify({ v: 1, responses, pending, savedAt: 0 }));
    return storage;
  }

  it("takes the newer state per question", async () => {
    const clock = fakeClock(2_000_000);
    const storage = seeded(
      {
        newerLocal: { value: mcq("L"), flagged: false, updatedAt: 200 },
        newerServer: { value: mcq("L"), flagged: false, updatedAt: 100 },
        same: { value: mcq("S"), flagged: true, updatedAt: 100 },
      },
      [],
    );
    const t = manualTransport();
    const { sync } = make({ storage, clock, save: t.save, online: false });
    sync.mergeServer({
      status: "in_progress",
      responses: [
        { questionId: "newerLocal", value: mcq("S"), flagged: false, updatedAt: 150 },
        { questionId: "newerServer", value: mcq("S"), flagged: true, updatedAt: 150 },
        { questionId: "same", value: mcq("S"), flagged: true, updatedAt: 120 },
        { questionId: "serverOnly", value: mcq("X"), flagged: false, updatedAt: 90 },
      ],
    });
    expect(sync.get("newerLocal")?.value).toEqual(mcq("L"));
    expect(sync.get("newerServer")).toEqual({ value: mcq("S"), flagged: true, updatedAt: 150 });
    expect(sync.get("serverOnly")?.value).toEqual(mcq("X"));
    // Only the local winner is resent.
    expect(sync.snapshot().pending).toEqual(["newerLocal"]);
    sync.setOnline(true);
    await settle();
    expect(t.calls.map((c) => c.req)).toEqual([
      { questionId: "newerLocal", value: mcq("L"), flagged: false, clientUpdatedAt: 200 },
    ]);
  });

  it("a tie goes to the server", () => {
    const storage = seeded({ q1: { value: mcq("L"), flagged: false, updatedAt: 100 } }, ["q1"]);
    const { sync } = make({ storage, save: manualTransport().save, online: false });
    sync.mergeServer({
      status: "in_progress",
      responses: [{ questionId: "q1", value: mcq("S"), flagged: false, updatedAt: 100 }],
    });
    expect(sync.get("q1")?.value).toEqual(mcq("S"));
    expect(sync.pendingCount).toBe(0);
  });

  it("requeues a local answer the server never got", () => {
    const storage = seeded({
      q1: { value: mcq("A"), flagged: false, updatedAt: 100 },
      cleared: { flagged: false, updatedAt: 100 },
    });
    const { sync } = make({ storage, save: manualTransport().save, online: false });
    sync.mergeServer({ status: "in_progress", responses: [] });
    expect(sync.snapshot().pending).toEqual(["q1"]);
  });

  it("drops a pending entry the server already has", () => {
    const storage = seeded({ q1: { value: mcq("A"), flagged: false, updatedAt: 100 } }, ["q1"]);
    const { sync } = make({ storage, save: manualTransport().save, online: false });
    // Server clamped clientUpdatedAt to its own clock, so its time is older.
    sync.mergeServer({
      status: "in_progress",
      responses: [{ questionId: "q1", value: mcq("A"), flagged: false, updatedAt: 90 }],
    });
    expect(sync.pendingCount).toBe(0);
    expect(sync.get("q1")?.updatedAt).toBe(100);
  });

  it("keeps a newer local change made while its save is in flight", async () => {
    const clock = fakeClock(1_000);
    const t = manualTransport();
    const { sync } = make({ clock, save: t.save });
    sync.setAnswer("q1", mcq("A"));
    clock.t += 10;
    sync.setAnswer("q1", mcq("B"));
    // The subscription reports the first save before the reply arrives.
    sync.mergeServer({
      status: "in_progress",
      responses: [{ questionId: "q1", value: mcq("A"), flagged: false, updatedAt: 1_000 }],
    });
    expect(sync.get("q1")?.value).toEqual(mcq("B"));
    t.calls[0]!.resolve({ savedAt: 1_010, applied: true });
    await settle();
    expect(t.calls[1]!.req.value).toEqual(mcq("B"));
  });

  it("server wins outright once submitted, and the runner goes read-only", async () => {
    const storage = seeded({ q1: { value: mcq("L"), flagged: true, updatedAt: 999 } }, ["q1"]);
    const t = manualTransport();
    const { sync, snaps } = make({ storage, save: t.save, online: false });
    sync.mergeServer({
      status: "submitted",
      responses: [{ questionId: "q2", value: mcq("S"), flagged: false, updatedAt: 1 }],
    });
    expect(sync.get("q1")).toBeUndefined();
    expect(sync.get("q2")?.value).toEqual(mcq("S"));
    expect(sync.pendingCount).toBe(0);
    expect(snaps.at(-1)!.status).toBe("closed");
    sync.setOnline(true);
    await settle();
    expect(t.calls).toHaveLength(0);
    sync.clearCache();
    expect(storage.getItem(cacheKey(ID))).toBeNull();
  });

  it("treats a null server value as unanswered", () => {
    const { sync } = make({ save: manualTransport().save, online: false });
    sync.mergeServer({
      status: "in_progress",
      responses: [{ questionId: "q1", value: null, flagged: true, updatedAt: 5 }],
    });
    expect(sync.get("q1")).toEqual({ flagged: true, updatedAt: 5 });
  });
});

describe("rememberStartClock", () => {
  it("seeds the clock without touching saved answers", () => {
    const storage = memoryStorage();
    storage.setItem(
      cacheKey(ID),
      JSON.stringify({
        v: 1,
        responses: { q1: { flagged: true, updatedAt: 1 } },
        pending: ["q1"],
        savedAt: 0,
      }),
    );
    expect(rememberStartClock(storage, ID, 10_000, 1_000, 1_400)).toBe(true);
    const cache = readCache(storage, ID)!;
    expect(cache.clock).toEqual({ offset: 8_800, rtt: 400, at: 1_400 });
    expect(cache.pending).toEqual(["q1"]);
    expect(rememberStartClock(null, ID, 1, 1, 1)).toBe(false);
  });
});
