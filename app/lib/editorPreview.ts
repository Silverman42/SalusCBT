/**
 * "Preview as student" (T-608; ED-1; LLD §5.2): `editor.previewAttempt`
 * returns a fresh anon token for a preview attempt. It must never become the
 * tutor's student identity (`useAnonIdentity`, localStorage `salus.anon.v1`),
 * so it is kept in this tab's sessionStorage under its own key, and the
 * in-editor preview page (`/tutor/versions/[id]/preview/[attemptId]`) sits
 * the attempt with it. Pure: storage is passed in.
 */
import { isValidToken } from "./anonIdentity";

export const PREVIEW_KEY_PREFIX = "salus.preview.v1.";

export type PreviewMode = "standard" | "retake";

export interface PreviewTicket {
  attemptId: string;
  versionId: string;
  anonToken: string;
}

export type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function previewStorageKey(attemptId: string): string {
  return `${PREVIEW_KEY_PREFIX}${attemptId}`;
}

export function previewPath(versionId: string, attemptId: string): string {
  return `/tutor/versions/${encodeURIComponent(versionId)}/preview/${encodeURIComponent(attemptId)}`;
}

/** Remember a preview's token for this tab; `false` when storage is unavailable. */
export function savePreviewTicket(
  storage: SessionStorageLike | null | undefined,
  ticket: PreviewTicket,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      previewStorageKey(ticket.attemptId),
      JSON.stringify({ versionId: ticket.versionId, anonToken: ticket.anonToken }),
    );
    return true;
  } catch {
    return false;
  }
}

/** The ticket for `attemptId` if this tab started it for `versionId`, else `null`. */
export function loadPreviewTicket(
  storage: SessionStorageLike | null | undefined,
  attemptId: string,
  versionId: string,
): PreviewTicket | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(previewStorageKey(attemptId));
    if (!raw) return null;
    const data = JSON.parse(raw) as { versionId?: unknown; anonToken?: unknown };
    if (data.versionId !== versionId || !isValidToken(data.anonToken)) return null;
    return { attemptId, versionId, anonToken: data.anonToken };
  } catch {
    return null;
  }
}

export function forgetPreviewTicket(
  storage: SessionStorageLike | null | undefined,
  attemptId: string,
): void {
  try {
    storage?.removeItem(previewStorageKey(attemptId));
  } catch {
    // Nothing to do: the attempt is deleted by the next preview anyway.
  }
}

/** "Standard · PBQ set A" / "Retake · PBQ set B". */
export function previewModeLabel(mode: PreviewMode): string {
  return mode === "retake" ? "Retake · PBQ set B" : "Standard · PBQ set A";
}

/**
 * Saves preview answers one question at a time (`attempts.saveResponse`):
 * a debounced change waits `delayMs`, saves for a question run in order,
 * and `flush()` sends everything still waiting (before submit). The preview
 * page needs no offline cache, so this is much simpler than `AttemptSync`.
 */
export class PreviewSaver<V> {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly revs = new Map<string, number>();
  private readonly values = new Map<string, V | null>();
  private readonly unsaved = new Set<string>();

  constructor(
    private readonly send: (questionId: string, value: V | null) => Promise<void>,
    private readonly onChange: (state: { pending: number; error: unknown }) => void,
    private readonly delayMs = 400,
  ) {}

  private error: unknown = null;

  get pending(): number {
    return this.unsaved.size;
  }

  private notify() {
    this.onChange({ pending: this.unsaved.size, error: this.error });
  }

  /** Record a new answer and schedule its save. */
  set(questionId: string, value: V | null, opts: { debounce?: boolean } = {}) {
    this.values.set(questionId, value);
    this.revs.set(questionId, (this.revs.get(questionId) ?? 0) + 1);
    this.unsaved.add(questionId);
    this.notify();
    const timer = this.timers.get(questionId);
    if (timer) clearTimeout(timer);
    if (opts.debounce) {
      this.timers.set(
        questionId,
        setTimeout(() => void this.save(questionId), this.delayMs),
      );
    } else {
      this.timers.delete(questionId);
      void this.save(questionId);
    }
  }

  private save(questionId: string): Promise<void> {
    this.timers.delete(questionId);
    const rev = this.revs.get(questionId) ?? 0;
    const value = this.values.get(questionId) ?? null;
    const run = async () => {
      try {
        await this.send(questionId, value);
        this.error = null;
        if (this.revs.get(questionId) === rev) this.unsaved.delete(questionId);
      } catch (err) {
        this.error = err;
      }
      this.notify();
    };
    const chain = (this.chains.get(questionId) ?? Promise.resolve()).then(run);
    this.chains.set(questionId, chain);
    return chain;
  }

  /** Send every waiting save and wait for all saves; resolves to the number still unsaved. */
  async flush(): Promise<number> {
    for (const id of [...this.timers.keys()]) void this.save(id);
    await Promise.all([...this.chains.values()]);
    // A failed save stays unsaved: try those once more.
    if (this.unsaved.size > 0) {
      await Promise.all([...this.unsaved].map((id) => this.save(id)));
    }
    return this.unsaved.size;
  }

  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
