<script setup lang="ts">
import { useCountdownTimer } from "../composables/useCountdownTimer";
import type { OpenMotionForVoter } from "@mcdc-convention-voting/shared";

const props = defineProps<{
	motion: OpenMotionForVoter;
}>();

const emit = defineEmits<(e: "click", motionId: number) => void>();

// Use countdown timer composable
const { remainingTimeString, isTimeUrgent, isExpired } = useCountdownTimer({
	getVotingEndsAt: () => new Date(props.motion.votingEndsAt),
});

// Alias for template
const isUrgent = isTimeUrgent;

function handleClick(): void {
	emit("click", props.motion.id);
}
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
