<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { getOpenMotions } from "../../services/api";
import type { OpenMotionForVoter } from "@mcdc-convention-voting/shared";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();
const motion = ref<OpenMotionForVoter | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// Time constants for countdown
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const UPDATE_INTERVAL_MS = 1000;
const ZERO = 0;
const DECIMAL_RADIX = 10;

const now = ref(new Date());
let intervalId: ReturnType<typeof setInterval> | null = null;

// Computed remaining time in milliseconds
const remainingMs = computed((): number => {
	if (motion.value === null) {
		return ZERO;
	}
	const endTime = new Date(motion.value.votingEndsAt).getTime();
	const remaining = endTime - now.value.getTime();
	return remaining > ZERO ? remaining : ZERO;
});

// Format remaining time as human-readable string
const remainingTimeString = computed((): string => {
	if (remainingMs.value === ZERO) {
		return "Voting ended";
	}

	const totalSeconds = Math.floor(remainingMs.value / MS_PER_SECOND);
	const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
	const seconds = totalSeconds % SECONDS_PER_MINUTE;

	if (minutes >= MINUTES_PER_HOUR) {
		const hours = Math.floor(minutes / MINUTES_PER_HOUR);
		const remainingMinutes = minutes % MINUTES_PER_HOUR;
		return `${String(hours)}h ${String(remainingMinutes)}m ${String(seconds)}s remaining`;
	}

	return `${String(minutes)}m ${String(seconds)}s remaining`;
});

async function loadMotion(): Promise<void> {
	const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(motionId)) {
		error.value = "Invalid motion ID";
		loading.value = false;
		return;
	}

	try {
		// For now, fetch all open motions and find the one we need
		// In future, create a dedicated endpoint for single motion
		const response = await getOpenMotions();
		if (!response.success || response.data === undefined) {
			error.value = response.error ?? "Failed to load motion";
			loading.value = false;
			return;
		}

		const found = response.data.data.find((m) => m.id === motionId);

		if (found === undefined) {
			error.value = "Motion not found or not open for voting";
		} else {
			motion.value = found;
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load motion";
	} finally {
		loading.value = false;
	}
}

function goBack(): void {
	void router.push("/");
}

onMounted((): void => {
	void loadMotion();
	// Update countdown every second
	intervalId = setInterval((): void => {
		now.value = new Date();
	}, UPDATE_INTERVAL_MS);
});

onUnmounted((): void => {
	if (intervalId !== null) {
		clearInterval(intervalId);
	}
});
</script>

<template>
	<div class="motion-detail">
		<button class="btn btn-secondary" @click="goBack">
			&larr; Back to Dashboard
		</button>

		<div v-if="loading" class="loading">Loading motion...</div>

		<div v-else-if="error !== null" class="error">
			<p>{{ error }}</p>
			<button class="btn btn-primary" @click="goBack">
				Return to Dashboard
			</button>
		</div>

		<div v-else-if="motion !== null" class="motion-content">
			<div class="motion-header">
				<h2>{{ motion.name }}</h2>
				<span class="time-badge">{{ remainingTimeString }}</span>
			</div>

			<div v-if="motion.description" class="motion-description">
				<p>{{ motion.description }}</p>
			</div>

			<div class="motion-info">
				<div class="info-item">
					<span class="info-label">Meeting</span>
					<span class="info-value">{{ motion.meetingName }}</span>
				</div>
				<div class="info-item">
					<span class="info-label">Seats</span>
					<span class="info-value">{{ motion.seatCount }}</span>
				</div>
				<div class="info-item">
					<span class="info-label">Voting Pool</span>
					<span class="info-value">{{ motion.votingPoolName }}</span>
				</div>
			</div>

			<!-- Voting interface will go here in future issue -->
			<div class="voting-placeholder">
				<p>Voting interface coming soon...</p>
				<p class="hint">
					This feature will allow you to cast your vote for this motion.
				</p>
			</div>
		</div>
	</div>
</template>

<style scoped>
.motion-detail {
	max-width: 800px;
}

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.9rem;
	font-weight: 500;
}

.btn-secondary {
	background-color: #6c757d;
	color: white;
	margin-bottom: 1.5rem;
}

.btn-secondary:hover {
	background-color: #545b62;
}

.btn-primary {
	background-color: #007bff;
	color: white;
}

.btn-primary:hover {
	background-color: #0056b3;
}

.loading {
	text-align: center;
	padding: 3rem;
	color: #666;
	background: white;
	border-radius: 8px;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.error {
	text-align: center;
	padding: 3rem;
	color: #dc3545;
	background: white;
	border-radius: 8px;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.error p {
	margin: 0 0 1.5rem 0;
}

.motion-content {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.motion-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 1.5rem;
	gap: 1rem;
}

.motion-header h2 {
	margin: 0;
	color: #2c3e50;
	flex: 1;
}

.time-badge {
	font-size: 0.9rem;
	font-weight: 600;
	color: #28a745;
	white-space: nowrap;
	padding: 0.5rem 1rem;
	background: #e8f5e9;
	border-radius: 4px;
}

.motion-description {
	color: #666;
	margin-bottom: 1.5rem;
	padding-bottom: 1.5rem;
	border-bottom: 1px solid #eee;
}

.motion-description p {
	margin: 0;
	line-height: 1.6;
}

.motion-info {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	gap: 1rem;
	margin-bottom: 2rem;
}

.info-item {
	background: #f8f9fa;
	padding: 1rem;
	border-radius: 4px;
}

.info-label {
	display: block;
	font-size: 0.8rem;
	color: #888;
	text-transform: uppercase;
	margin-bottom: 0.25rem;
}

.info-value {
	display: block;
	font-size: 1rem;
	color: #2c3e50;
	font-weight: 500;
}

.voting-placeholder {
	text-align: center;
	padding: 3rem;
	background: #f8f9fa;
	border-radius: 8px;
	border: 2px dashed #dee2e6;
}

.voting-placeholder p {
	margin: 0;
	color: #666;
}

.voting-placeholder .hint {
	font-size: 0.875rem;
	color: #999;
	margin-top: 0.5rem;
}
</style>
