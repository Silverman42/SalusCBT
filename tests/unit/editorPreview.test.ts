import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../../app/lib/anonIdentity";
import {
  forgetPreviewTicket,
  loadPreviewTicket,
  PREVIEW_KEY_PREFIX,
  previewModeLabel,
  previewPath,
  PreviewSaver,
  previewStorageKey,
  savePreviewTicket,
  type SessionStorageLike,
} from "../../app/lib/editorPreview";

const TOKEN = "A".repeat(43);

function memory(): SessionStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("preview tickets", () => {
  it("keeps the token under its own key, never the student identity's", () => {
    const s = memory();
    expect(savePreviewTicket(s, { attemptId: "a1", versionId: "v1", anonToken: TOKEN })).toBe(true);
    expect([...s.data.keys()]).toEqual([`${PREVIEW_KEY_PREFIX}a1`]);
    expect(previewStorageKey("a1")).not.toBe(STORAGE_KEY);
    expect(loadPreviewTicket(s, "a1", "v1")).toEqual({
      attemptId: "a1",
      versionId: "v1",
      anonToken: TOKEN,
    });
  });

  it("refuses another version's ticket, a bad token, junk and missing storage", () => {
    const s = memory();
    savePreviewTicket(s, { attemptId: "a1", versionId: "v1", anonToken: TOKEN });
    expect(loadPreviewTicket(s, "a1", "v2")).toBeNull();
    expect(loadPreviewTicket(s, "a2", "v1")).toBeNull();
    s.setItem(previewStorageKey("a3"), JSON.stringify({ versionId: "v1", anonToken: "short" }));
    expect(loadPreviewTicket(s, "a3", "v1")).toBeNull();
    s.setItem(previewStorageKey("a4"), "{not json");
    expect(loadPreviewTicket(s, "a4", "v1")).toBeNull();
    expect(loadPreviewTicket(null, "a1", "v1")).toBeNull();
    expect(savePreviewTicket(null, { attemptId: "a", versionId: "v", anonToken: TOKEN })).toBe(
      false,
    );
  });

  it("reports a storage that throws", () => {
    const broken: SessionStorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(savePreviewTicket(broken, { attemptId: "a", versionId: "v", anonToken: TOKEN })).toBe(
      false,
    );
    expect(loadPreviewTicket(broken, "a", "v")).toBeNull();
    expect(() => forgetPreviewTicket(broken, "a")).not.toThrow();
  });

  it("forgets a ticket", () => {
    const s = memory();
    savePreviewTicket(s, { attemptId: "a1", versionId: "v1", anonToken: TOKEN });
    forgetPreviewTicket(s, "a1");
    expect(s.data.size).toBe(0);
  });

  it("builds the preview path and labels", () => {
    expect(previewPath("v 1", "a/1")).toBe("/tutor/versions/v%201/preview/a%2F1");
    expect(previewModeLabel("standard")).toMatch(/set A/);
    expect(previewModeLabel("retake")).toMatch(/set B/);
  });
});

describe("PreviewSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves clicks at once and debounced typing after the delay, latest value only", async () => {
    const sent: [string, string | null][] = [];
    const saver = new PreviewSaver<string>(
      async (q, v) => void sent.push([q, v]),
      () => {},
      400,
    );
    saver.set("q1", "a");
    await vi.runAllTimersAsync();
    expect(sent).toEqual([["q1", "a"]]);
    saver.set("q2", "h", { debounce: true });
    saver.set("q2", "he", { debounce: true });
    await vi.advanceTimersByTimeAsync(399);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([
      ["q1", "a"],
      ["q2", "he"],
    ]);
    expect(saver.pending).toBe(0);
  });

  it("flushes waiting saves before submit and reports what failed", async () => {
    let fail = true;
    const states: number[] = [];
    const saver = new PreviewSaver<string>(
      async () => {
        if (fail) throw new Error("offline");
      },
      (s) => states.push(s.pending),
    );
    saver.set("q1", "x", { debounce: true });
    expect(saver.pending).toBe(1);
    const left = saver.flush();
    await vi.runAllTimersAsync();
    expect(await left).toBe(1);
    fail = false;
    const retry = saver.flush();
    await vi.runAllTimersAsync();
    expect(await retry).toBe(0);
    expect(states.at(-1)).toBe(0);
  });

  it("keeps a question unsaved while a newer change is still waiting", async () => {
    const saver = new PreviewSaver<string>(
      async () => {},
      () => {},
    );
    saver.set("q1", "a");
    saver.set("q1", "ab", { debounce: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.pending).toBe(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(saver.pending).toBe(0);
    saver.dispose();
  });
});
