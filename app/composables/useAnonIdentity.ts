import { getCurrentInstance, onMounted } from "vue";
import {
  DISPLAY_NAME_MAX,
  EXPORT_FILENAME,
  IMPORT_ERRORS,
  IMPORT_MAX_BYTES,
  buildExport,
  loadOrCreateIdentity,
  parseImport,
  saveIdentity,
  serializeExport,
  type IdentityState,
  type StorageLike,
} from "~/lib/anonIdentity";

export type ImportPreview =
  | {
      ok: true;
      token: string;
      displayName?: string;
      exportedAt?: string;
      /** Replace the local identity with the imported one. Call after the user confirms. */
      confirm: () => void;
    }
  | { ok: false; error: string };

function safeLocalStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Anonymous student identity (LLD §4). State is shared via `useState` and is
 * only initialised on the client; on the server `token` is null.
 */
export function useAnonIdentity() {
  const state = useState<IdentityState | null>("salus-anon-identity", () => null);
  const nuxtApp = useNuxtApp();

  function init() {
    if (state.value) return;
    state.value = loadOrCreateIdentity(safeLocalStorage());
  }

  if (import.meta.client && !state.value) {
    // Defer during hydration so server and client markup match.
    if (nuxtApp.isHydrating && getCurrentInstance()) onMounted(init);
    else init();
  }

  const token = computed(() => state.value?.token ?? null);
  const displayName = computed(() => state.value?.displayName ?? null);
  const persistent = computed(() => state.value?.persistent ?? true);
  const ready = computed(() => state.value !== null);

  function persist(next: IdentityState) {
    const ok = next.persistent && saveIdentity(safeLocalStorage(), next);
    state.value = { ...next, persistent: ok };
  }

  function setDisplayName(name: string | null) {
    if (!state.value) init();
    if (!state.value) return;
    const trimmed = name?.trim().slice(0, DISPLAY_NAME_MAX);
    const { displayName: _old, ...rest } = state.value;
    persist(trimmed ? { ...rest, displayName: trimmed } : rest);
  }

  /** Download `salus-progress.json`. The calling page must warn that it is a secret (EX-20). */
  function exportProgress() {
    if (!import.meta.client || !state.value) return;
    const blob = new Blob([serializeExport(buildExport(state.value))], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = EXPORT_FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /**
   * Read and validate a progress file. Nothing changes until the caller
   * invokes `confirm()` on a successful preview.
   */
  async function importProgress(file: Blob): Promise<ImportPreview> {
    if (file.size > IMPORT_MAX_BYTES) return { ok: false, error: IMPORT_ERRORS.tooLarge };
    let text: string;
    try {
      text = await file.text();
    } catch {
      return { ok: false, error: IMPORT_ERRORS.notJson };
    }
    const result = parseImport(text);
    if (!result.ok) return result;
    const { token: newToken, displayName: name, exportedAt } = result.value;
    return {
      ok: true,
      token: newToken,
      ...(name ? { displayName: name } : {}),
      ...(exportedAt ? { exportedAt } : {}),
      confirm: () =>
        persist({
          token: newToken,
          createdAt: Date.now(),
          persistent: true,
          ...(name ? { displayName: name } : {}),
        }),
    };
  }

  return {
    token,
    displayName,
    persistent,
    ready,
    setDisplayName,
    exportProgress,
    importProgress,
  };
}
