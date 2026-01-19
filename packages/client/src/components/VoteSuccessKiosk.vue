<script setup lang="ts">
/**
 * Vote success screen for kiosk mode
 * Shows a countdown before auto-logout
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
	<div class="modal-overlay">
		<div class="modal success-modal">
			<div class="success-icon">&#10003;</div>
			<h3>Vote Submitted!</h3>
			<p>Your vote has been recorded successfully.</p>
			<p class="countdown-text">
				Logging out in <strong>{{ secondsLeft }}</strong
				>...
			</p>
		</div>
	</div>
</template>

<style scoped>
.modal-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
}

.modal {
	background: white;
	border-radius: 12px;
	padding: 2rem;
	max-width: 400px;
	width: 90%;
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.success-modal {
	text-align: center;
}

.success-icon {
	width: 60px;
	height: 60px;
	background: #28a745;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	margin: 0 auto 1rem;
	color: white;
	font-size: 32px;
}

.success-modal h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.success-modal p {
	margin: 0 0 1rem 0;
	color: #666;
}

.countdown-text {
	font-size: 1.1rem;
	color: #666;
}

.countdown-text strong {
	color: #2c3e50;
	font-size: 1.5rem;
}
</style>
