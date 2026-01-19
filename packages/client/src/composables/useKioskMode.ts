/**
 * Kiosk mode composable for managing kiosk mode state
 */
import { ref, computed } from "vue";

// Kiosk mode timing constants (in milliseconds)
export const KIOSK_INACTIVITY_TIMEOUT_MS = 60000; // 60 seconds
export const KIOSK_WARNING_COUNTDOWN_MS = 10000; // 10 seconds
export const KIOSK_POST_VOTE_COUNTDOWN_MS = 5000; // 5 seconds

// Constants
const KIOSK_STORAGE_KEY = "kioskMode";
const KIOSK_QUERY_PARAM = "KioskMode";

// Module-level state (singleton pattern)
const kioskModeEnabled = ref(false);
const isInitialized = ref(false);

/**
 * Initialize kiosk mode from URL query parameter
 * Should be called on app startup
 */
export function initKioskMode(searchParams: URLSearchParams): void {
	const kioskParam = searchParams.get(KIOSK_QUERY_PARAM);

	if (kioskParam === null) {
		// Check sessionStorage for persisted value
		const storedValue = sessionStorage.getItem(KIOSK_STORAGE_KEY);
		if (storedValue !== null) {
			kioskModeEnabled.value = storedValue === "true";
		}
	} else {
		const enabled = kioskParam.toLowerCase() === "true";
		kioskModeEnabled.value = enabled;
		// Store in sessionStorage to persist across page navigations
		sessionStorage.setItem(KIOSK_STORAGE_KEY, String(enabled));
	}

	isInitialized.value = true;
}

/**
 * Get the kiosk mode query parameter to preserve in URLs
 * Returns an object suitable for Vue Router query params
 */
export function getKioskModeQueryParam(): Record<string, string> | undefined {
	if (kioskModeEnabled.value) {
		return { [KIOSK_QUERY_PARAM]: "true" };
	}
	return undefined;
}

/**
 * Kiosk mode composable
 */
export function useKioskMode(): {
	isKioskMode: ReturnType<typeof computed<boolean>>;
	isKioskModeInitialized: typeof isInitialized;
	getKioskModeQueryParam: typeof getKioskModeQueryParam;
	KIOSK_INACTIVITY_TIMEOUT_MS: number;
	KIOSK_WARNING_COUNTDOWN_MS: number;
	KIOSK_POST_VOTE_COUNTDOWN_MS: number;
} {
	const isKioskMode = computed(() => kioskModeEnabled.value);

	return {
		isKioskMode,
		isKioskModeInitialized: isInitialized,
		getKioskModeQueryParam,
		KIOSK_INACTIVITY_TIMEOUT_MS,
		KIOSK_WARNING_COUNTDOWN_MS,
		KIOSK_POST_VOTE_COUNTDOWN_MS,
	};
}
