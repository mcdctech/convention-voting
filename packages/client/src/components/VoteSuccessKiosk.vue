<script setup lang="ts">
/**
 * Vote success screen for kiosk mode
 * Shows a full-page countdown before auto-logout
 * Used when there are no remaining open motions for the user
 */
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import {
	useKioskMode,
	KIOSK_POST_VOTE_COUNTDOWN_MS,
} from "../composables/useKioskMode";

// Constants
const MS_PER_SECOND = 1000;
const COUNTDOWN_INTERVAL_MS = 1000;
const COUNTDOWN_DECREMENT = 1;
const ZERO = 0;

const router = useRouter();
const { logout } = useAuth();
const { getKioskModeQueryParam } = useKioskMode();

const secondsLeft = ref(
	Math.floor(KIOSK_POST_VOTE_COUNTDOWN_MS / MS_PER_SECOND),
);
let countdownIntervalId: ReturnType<typeof setInterval> | null = null;

function performLogout(): void {
	// Stop the countdown
	if (countdownIntervalId !== null) {
		clearInterval(countdownIntervalId);
		countdownIntervalId = null;
	}

	// Clear auth
	logout();

	// Redirect to login with kiosk param preserved
	const kioskQuery = getKioskModeQueryParam();
	void router.push({ path: "/login", query: kioskQuery });
}

function startCountdown(): void {
	countdownIntervalId = setInterval(() => {
		secondsLeft.value -= COUNTDOWN_DECREMENT;

		if (secondsLeft.value <= ZERO) {
			performLogout();
		}
	}, COUNTDOWN_INTERVAL_MS);
}

onMounted(() => {
	startCountdown();
});

onUnmounted(() => {
	if (countdownIntervalId !== null) {
		clearInterval(countdownIntervalId);
	}
});
</script>

<template>
	<div class="logout-screen">
		<div class="logout-content">
			<div class="success-icon">&#10003;</div>
			<h1>Vote Submitted!</h1>
			<p class="success-message">Your vote has been recorded successfully.</p>
			<p class="countdown-text">
				Logging out in <strong>{{ secondsLeft }}</strong
				>...
			</p>
		</div>
	</div>
</template>

<style scoped>
.logout-screen {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: #f5f5f5;
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
}

.logout-content {
	text-align: center;
	padding: 3rem;
	background: white;
	border-radius: 16px;
	box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
	max-width: 500px;
	width: 90%;
}

.success-icon {
	width: 80px;
	height: 80px;
	background: #28a745;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	margin: 0 auto 1.5rem;
	color: white;
	font-size: 40px;
}

.logout-content h1 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
	font-size: 2rem;
}

.success-message {
	margin: 0 0 2rem 0;
	color: #666;
	font-size: 1.1rem;
}

.countdown-text {
	font-size: 1.25rem;
	color: #666;
	margin: 0;
}

.countdown-text strong {
	color: #2c3e50;
	font-size: 2rem;
}
</style>
