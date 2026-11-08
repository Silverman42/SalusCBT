import { onScopeDispose, ref } from "vue";

/** `Date.now()`, refreshed every minute, for relative times such as "Expires in 2 hours". */
export function useMinuteClock() {
  const now = ref(Date.now());
  const timer = setInterval(() => (now.value = Date.now()), 60_000);
  onScopeDispose(() => clearInterval(timer));
  return now;
}
