import { ref, computed } from 'vue';
import localforage from 'localforage';

const RATE_LIMIT_KEY = '__nimbus_rate_limit_v1';

const _resetAt = ref(null);
let _initialized = false;

async function _init() {
  if (_initialized) return;
  _initialized = true;
  try {
    const stored = await localforage.getItem(RATE_LIMIT_KEY);
    if (stored && stored.resetAt) {
      _resetAt.value = stored.resetAt;
    }
  } catch { /* ignore */ }
}

_init();

export function useRateLimit() {
  const isRateLimited = computed(() => {
    if (!_resetAt.value) return false;
    return Date.now() < new Date(_resetAt.value).getTime();
  });

  const resetTime = computed(() => {
    if (!_resetAt.value) return null;
    const d = new Date(_resetAt.value);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  });

  async function setRateLimited(resetAt) {
    _resetAt.value = resetAt;
    try {
      await localforage.setItem(RATE_LIMIT_KEY, { resetAt });
    } catch { /* ignore */ }
  }

  async function clearRateLimit() {
    _resetAt.value = null;
    try {
      await localforage.removeItem(RATE_LIMIT_KEY);
    } catch { /* ignore */ }
  }

  return { isRateLimited, resetTime, setRateLimited, clearRateLimit };
}
