<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { OpenMotionForVoter } from "@mcdc-convention-voting/shared";

const props = defineProps<{
	motion: OpenMotionForVoter;
}>();

const emit = defineEmits<(e: "click", motionId: number) => void>();

// Time constants
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const UPDATE_INTERVAL_MS = 1000;
const ZERO = 0;
const URGENT_THRESHOLD_MINUTES = 5;

const now = ref(new Date());
let intervalId: ReturnType<typeof setInterval> | null = null;

// Computed remaining time in milliseconds
const remainingMs = computed((): number => {
	const endTime = new Date(props.motion.votingEndsAt).getTime();
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
		return `${String(hours)}h ${String(remainingMinutes)}m`;
	}

	return `${String(minutes)}m ${String(seconds)}s`;
});

// Check if time is running out (less than 5 minutes)
const isUrgent = computed((): boolean => {
	const urgentThresholdMs =
		URGENT_THRESHOLD_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
	return remainingMs.value > ZERO && remainingMs.value < urgentThresholdMs;
});

// Check if voting has ended
const isExpired = computed((): boolean => remainingMs.value === ZERO);

function handleClick(): void {
	emit("click", props.motion.id);
}

onMounted((): void => {
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
	<div
		class="motion-card"
		:class="{ urgent: isUrgent, expired: isExpired }"
		@click="handleClick"
	>
		<div class="motion-header">
			<h4 class="motion-name">{{ motion.name }}</h4>
			<span class="time-remaining" :class="{ urgent: isUrgent }">
				{{ remainingTimeString }}
			</span>
		</div>
		<div v-if="motion.description" class="motion-description">
			{{ motion.description }}
		</div>
		<div class="motion-meta">
			<span class="meeting-name">{{ motion.meetingName }}</span>
			<span class="seat-count">{{ motion.seatCount }} seat(s)</span>
		</div>
		<div class="motion-action">
			<span class="vote-prompt">Click to vote</span>
		</div>
	</div>
</template>

<style scoped>
.motion-card {
	background: white;
	border-radius: 8px;
	padding: 1.25rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	cursor: pointer;
	transition:
		transform 0.2s,
		box-shadow 0.2s,
		border-color 0.2s;
	border: 2px solid transparent;
}

.motion-card:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
	border-color: #007bff;
}

.motion-card.urgent {
	border-color: #ffc107;
	background: #fffef0;
}

.motion-card.urgent:hover {
	border-color: #e0a800;
}

.motion-card.expired {
	opacity: 0.7;
	border-color: #dc3545;
	background: #fff5f5;
}

.motion-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 0.75rem;
	gap: 1rem;
}

.motion-name {
	margin: 0;
	color: #2c3e50;
	font-size: 1.1rem;
	flex: 1;
}

.time-remaining {
	font-size: 0.9rem;
	font-weight: 600;
	color: #28a745;
	white-space: nowrap;
	padding: 0.25rem 0.5rem;
	background: #e8f5e9;
	border-radius: 4px;
}

.time-remaining.urgent {
	color: #856404;
	background: #fff3cd;
}

.motion-description {
	color: #666;
	font-size: 0.9rem;
	margin-bottom: 0.75rem;
	line-height: 1.4;
}

.motion-meta {
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: 0.85rem;
	color: #888;
	margin-bottom: 0.75rem;
}

.meeting-name {
	font-style: italic;
}

.seat-count {
	font-weight: 500;
}

.motion-action {
	text-align: center;
	padding-top: 0.5rem;
	border-top: 1px solid #eee;
}

.vote-prompt {
	color: #007bff;
	font-weight: 500;
	font-size: 0.9rem;
}

.motion-card.expired .vote-prompt {
	color: #dc3545;
}

.motion-card.expired .vote-prompt::before {
	content: "Voting closed - ";
}
</style>
