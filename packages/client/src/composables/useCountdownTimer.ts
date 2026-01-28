/**
 * Composable for countdown timer logic
 * Provides reactive countdown time remaining for voting motions
 */
import { ref, computed, onMounted, onUnmounted, type Ref } from "vue";

// Time constants
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const TIMER_UPDATE_INTERVAL_MS = 1000;
const ZERO = 0;
const URGENT_THRESHOLD_MINUTES = 5;

export interface CountdownTimerOptions {
	/**
	 * Function that returns when voting ends
	 */
	getVotingEndsAt: () => Date | null;
}

export interface CountdownTimer {
	/**
	 * Remaining time in milliseconds (0 when overtime)
	 */
	remainingMs: Ref<number>;

	/**
	 * Overtime in milliseconds (0 when not overtime)
	 */
	overtimeMs: Ref<number>;

	/**
	 * Human-readable remaining time string
	 */
	remainingTimeString: Ref<string>;

	/**
	 * Whether time is urgent (< 5 minutes remaining)
	 */
	isTimeUrgent: Ref<boolean>;

	/**
	 * Whether planned duration has been exceeded
	 */
	isOvertime: Ref<boolean>;
}

/**
 * Format milliseconds as human-readable time string
 */
function formatDuration(ms: number): string {
	const totalSeconds = Math.floor(ms / MS_PER_SECOND);
	const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
	const seconds = totalSeconds % SECONDS_PER_MINUTE;

	if (minutes >= MINUTES_PER_HOUR) {
		const hours = Math.floor(minutes / MINUTES_PER_HOUR);
		const remainingMinutes = minutes % MINUTES_PER_HOUR;
		return `${String(hours)}h ${String(remainingMinutes)}m ${String(seconds)}s`;
	}

	return `${String(minutes)}m ${String(seconds)}s`;
}

/**
 * Use countdown timer for voting motion
 */
export function useCountdownTimer(
	options: CountdownTimerOptions,
): CountdownTimer {
	const { getVotingEndsAt } = options;

	const now = ref(new Date());
	let intervalId: ReturnType<typeof setInterval> | null = null;

	// Raw difference in milliseconds (negative when overtime)
	const rawDiffMs = computed((): number => {
		const endsAt = getVotingEndsAt();
		if (endsAt === null) {
			return ZERO;
		}

		return endsAt.getTime() - now.value.getTime();
	});

	// Computed remaining time in milliseconds (clamped to 0)
	const remainingMs = computed((): number =>
		rawDiffMs.value > ZERO ? rawDiffMs.value : ZERO,
	);

	// Computed overtime in milliseconds (0 when not overtime)
	const overtimeMs = computed((): number => {
		const endsAt = getVotingEndsAt();
		if (endsAt === null) {
			return ZERO;
		}
		return rawDiffMs.value < ZERO ? Math.abs(rawDiffMs.value) : ZERO;
	});

	// Format remaining time as human-readable string
	const remainingTimeString = computed((): string => {
		const endsAt = getVotingEndsAt();
		if (endsAt === null) {
			return "";
		}

		if (overtimeMs.value > ZERO) {
			return `Over by ${formatDuration(overtimeMs.value)}`;
		}

		if (remainingMs.value === ZERO) {
			return "Over by 0m 0s";
		}

		return formatDuration(remainingMs.value);
	});

	// Check if time is running out (less than 5 minutes)
	const isTimeUrgent = computed((): boolean => {
		const urgentThresholdMs =
			URGENT_THRESHOLD_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
		return remainingMs.value > ZERO && remainingMs.value < urgentThresholdMs;
	});

	// Check if planned duration has been exceeded
	const isOvertime = computed((): boolean => overtimeMs.value > ZERO);

	onMounted((): void => {
		intervalId = setInterval((): void => {
			now.value = new Date();
		}, TIMER_UPDATE_INTERVAL_MS);
	});

	onUnmounted((): void => {
		if (intervalId !== null) {
			clearInterval(intervalId);
		}
	});

	return {
		remainingMs,
		overtimeMs,
		remainingTimeString,
		isTimeUrgent,
		isOvertime,
	};
}
