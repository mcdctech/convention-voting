/**
 * Activity timeout composable for tracking user inactivity
 * Used in kiosk mode to auto-logout inactive users
 */
import { ref, onUnmounted } from "vue";
import {
	KIOSK_INACTIVITY_TIMEOUT_MS,
	KIOSK_WARNING_COUNTDOWN_MS,
} from "./useKioskMode";

// Constants
const MS_PER_SECOND = 1000;
const COUNTDOWN_INTERVAL_MS = 1000;
const INITIAL_COUNTDOWN_VALUE = 0;
const COUNTDOWN_DECREMENT = 1;

// Activity events to track
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
	"mousemove",
	"mousedown",
	"keydown",
	"touchstart",
	"scroll",
];

interface ActivityTimeoutState {
	showWarning: typeof showWarning;
	warningSecondsLeft: typeof warningSecondsLeft;
	confirmActivity: () => void;
	startTracking: () => void;
	stopTracking: () => void;
}

// Module-level state
const showWarning = ref(false);
const warningSecondsLeft = ref(INITIAL_COUNTDOWN_VALUE);

let inactivityTimeoutId: ReturnType<typeof setTimeout> | null = null;
let warningCountdownId: ReturnType<typeof setInterval> | null = null;
let isTracking = false;
let onLogoutCallback: (() => void) | null = null;

/**
 * Reset the inactivity timer
 */
function resetInactivityTimer(): void {
	// Clear existing timeout
	if (inactivityTimeoutId !== null) {
		clearTimeout(inactivityTimeoutId);
	}

	// Don't reset if warning is showing (user must click to dismiss)
	if (showWarning.value) {
		return;
	}

	// Set new timeout
	inactivityTimeoutId = setTimeout(() => {
		triggerWarning();
	}, KIOSK_INACTIVITY_TIMEOUT_MS);
}

/**
 * Trigger the warning modal with countdown
 */
function triggerWarning(): void {
	showWarning.value = true;
	warningSecondsLeft.value = Math.floor(
		KIOSK_WARNING_COUNTDOWN_MS / MS_PER_SECOND,
	);

	// Start countdown
	warningCountdownId = setInterval(() => {
		warningSecondsLeft.value -= COUNTDOWN_DECREMENT;

		if (warningSecondsLeft.value <= INITIAL_COUNTDOWN_VALUE) {
			// Time's up - trigger logout
			stopWarningCountdown();
			if (onLogoutCallback !== null) {
				onLogoutCallback();
			}
		}
	}, COUNTDOWN_INTERVAL_MS);
}

/**
 * Stop the warning countdown
 */
function stopWarningCountdown(): void {
	if (warningCountdownId !== null) {
		clearInterval(warningCountdownId);
		warningCountdownId = null;
	}
}

/**
 * Handle activity events
 */
function handleActivity(): void {
	resetInactivityTimer();
}

/**
 * User confirms they are still there
 */
function confirmActivity(): void {
	showWarning.value = false;
	stopWarningCountdown();
	resetInactivityTimer();
}

/**
 * Start tracking user activity
 */
function startTracking(logoutCallback: () => void): void {
	if (isTracking) {
		return;
	}

	onLogoutCallback = logoutCallback;
	isTracking = true;

	// Add event listeners
	for (const event of ACTIVITY_EVENTS) {
		window.addEventListener(event, handleActivity, { passive: true });
	}

	// Start the inactivity timer
	resetInactivityTimer();
}

/**
 * Stop tracking user activity
 */
function stopTracking(): void {
	if (!isTracking) {
		return;
	}

	isTracking = false;
	onLogoutCallback = null;

	// Remove event listeners
	for (const event of ACTIVITY_EVENTS) {
		window.removeEventListener(event, handleActivity);
	}

	// Clear timers
	if (inactivityTimeoutId !== null) {
		clearTimeout(inactivityTimeoutId);
		inactivityTimeoutId = null;
	}

	stopWarningCountdown();
	showWarning.value = false;
}

/**
 * Activity timeout composable
 */
export function useActivityTimeout(): ActivityTimeoutState {
	// Clean up on unmount
	onUnmounted(() => {
		stopTracking();
	});

	return {
		showWarning,
		warningSecondsLeft,
		confirmActivity,
		startTracking,
		stopTracking,
	};
}
