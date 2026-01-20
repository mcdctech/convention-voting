<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import {
	getMotionForVoting,
	castVote,
	getOpenMotions,
} from "../../services/api";
import { useAuth } from "../../composables/useAuth";
import { useKioskMode } from "../../composables/useKioskMode";
import VoteSuccessKiosk from "../../components/VoteSuccessKiosk.vue";
import type { MotionForVoting, Choice } from "@mcdc-convention-voting/shared";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();
const { isAdmin } = useAuth();
const { isKioskMode } = useKioskMode();

const motion = ref<MotionForVoting | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// Voting state
const selectedChoiceIds = ref<number[]>([]);
const isAbstaining = ref(false);
const showConfirmModal = ref(false);
const showSuccessModal = ref(false);
const showKioskLogout = ref(false);
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);

// Time constants for countdown
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const UPDATE_INTERVAL_MS = 1000;
const ZERO = 0;
const NOT_FOUND = -1;
const SINGLE_INCREMENT = 1;
const DECIMAL_RADIX = 10;

const now = ref(new Date());
let intervalId: ReturnType<typeof setInterval> | null = null;

// Computed remaining time in milliseconds
const remainingMs = computed((): number => {
	const votingEndsAt = motion.value?.votingEndsAt;
	if (votingEndsAt === null || votingEndsAt === undefined) {
		return ZERO;
	}
	const endTime = new Date(votingEndsAt).getTime();
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

// Check if user can select more choices
const canSelectMore = computed((): boolean => {
	if (motion.value === null || isAbstaining.value) {
		return false;
	}
	return selectedChoiceIds.value.length < motion.value.seatCount;
});

// Check if vote is ready to submit
const canSubmitVote = computed((): boolean => {
	if (isAbstaining.value) {
		return true;
	}
	return selectedChoiceIds.value.length > ZERO;
});

// Get selected choices for display
const selectedChoices = computed((): Choice[] => {
	if (motion.value === null) {
		return [];
	}
	return motion.value.choices.filter((c) =>
		selectedChoiceIds.value.includes(c.id),
	);
});

// Get reason message for why user cannot vote
const cannotVoteMessage = computed((): string => {
	if (motion.value === null) {
		return "";
	}
	switch (motion.value.votingEndedReason) {
		case "already_voted":
			return "You have already cast your vote for this motion.";
		case "not_in_pool":
			return "You are not eligible to vote on this motion.";
		case "voting_ended":
			return "Voting has ended for this motion.";
		case "not_active":
			return "This motion is not currently open for voting.";
		default:
			return "You cannot vote on this motion.";
	}
});

// Determine if we should use kiosk mode success screen
// Only for non-admin users in kiosk mode
const useKioskSuccessScreen = computed(
	(): boolean => isKioskMode.value && !isAdmin.value,
);

async function loadMotion(): Promise<void> {
	const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(motionId)) {
		error.value = "Invalid motion ID";
		loading.value = false;
		return;
	}

	try {
		const response = await getMotionForVoting(motionId);
		if (!response.success || response.data === undefined) {
			error.value = response.error ?? "Failed to load motion";
			loading.value = false;
			return;
		}

		motion.value = response.data;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load motion";
	} finally {
		loading.value = false;
	}
}

function toggleChoice(choiceId: number): void {
	if (isAbstaining.value) {
		return;
	}

	const index = selectedChoiceIds.value.indexOf(choiceId);
	if (index > NOT_FOUND) {
		// Remove choice
		selectedChoiceIds.value.splice(index, SINGLE_INCREMENT);
	} else if (canSelectMore.value) {
		// Add choice if under limit
		selectedChoiceIds.value.push(choiceId);
	}
}

function toggleAbstain(): void {
	isAbstaining.value = !isAbstaining.value;
	if (isAbstaining.value) {
		// Clear selections when abstaining
		selectedChoiceIds.value = [];
	}
}

function requestSubmitVote(): void {
	submitError.value = null;
	showConfirmModal.value = true;
}

function cancelConfirm(): void {
	showConfirmModal.value = false;
}

async function checkForRemainingOpenMotions(): Promise<boolean> {
	const openMotionsResponse = await getOpenMotions();
	const motionsList = openMotionsResponse.data?.data;
	return (
		openMotionsResponse.success &&
		motionsList !== undefined &&
		motionsList.length > ZERO
	);
}

async function handlePostVoteSuccess(): Promise<void> {
	showConfirmModal.value = false;

	// In kiosk mode (non-admin), check if there are remaining open motions
	if (!useKioskSuccessScreen.value) {
		showSuccessModal.value = true;
		return;
	}

	const hasOpenMotions = await checkForRemainingOpenMotions();
	if (hasOpenMotions) {
		// Still have open motions, show normal success modal
		showSuccessModal.value = true;
	} else {
		// No more open motions, show kiosk logout screen
		showKioskLogout.value = true;
	}
}

async function submitVote(): Promise<void> {
	if (motion.value === null) {
		return;
	}

	isSubmitting.value = true;
	submitError.value = null;

	try {
		const response = await castVote(motion.value.id, {
			choiceIds: selectedChoiceIds.value,
			abstain: isAbstaining.value,
		});

		if (!response.success) {
			submitError.value = response.error ?? "Failed to cast vote";
			return;
		}

		await handlePostVoteSuccess();
	} catch (err) {
		submitError.value =
			err instanceof Error ? err.message : "Failed to cast vote";
	} finally {
		isSubmitting.value = false;
	}
}

function returnToDashboard(): void {
	void router.push("/");
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
				<span class="time-badge" :class="{ urgent: remainingMs < 300000 }">{{
					remainingTimeString
				}}</span>
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

			<!-- Already voted or cannot vote message -->
			<div v-if="!motion.canVote" class="cannot-vote-message">
				<p>{{ cannotVoteMessage }}</p>
				<button class="btn btn-secondary" @click="returnToDashboard">
					Return to Dashboard
				</button>
			</div>

			<!-- Voting interface -->
			<div v-else class="voting-section">
				<h3>Cast Your Vote</h3>
				<p class="vote-instructions">
					Select up to {{ motion.seatCount }} choice(s), or choose to abstain.
				</p>

				<!-- Choices list -->
				<div class="choices-list">
					<div
						v-for="choice in motion.choices"
						:key="choice.id"
						class="choice-item"
						:class="{
							selected: selectedChoiceIds.includes(choice.id),
							disabled:
								isAbstaining ||
								(!selectedChoiceIds.includes(choice.id) && !canSelectMore),
						}"
						@click="toggleChoice(choice.id)"
					>
						<span class="choice-checkbox">
							<span
								v-if="selectedChoiceIds.includes(choice.id)"
								class="checkmark"
								>&#10003;</span
							>
						</span>
						<span class="choice-name">{{ choice.name }}</span>
					</div>
				</div>

				<!-- Abstain option -->
				<div class="abstain-section">
					<div
						class="choice-item abstain-item"
						:class="{ selected: isAbstaining }"
						@click="toggleAbstain"
					>
						<span class="choice-checkbox">
							<span v-if="isAbstaining" class="checkmark">&#10003;</span>
						</span>
						<span class="choice-name">Abstain</span>
					</div>
				</div>

				<!-- Selection summary -->
				<div v-if="selectedChoiceIds.length > 0" class="selection-summary">
					<p>
						Selected ({{ selectedChoiceIds.length }}/{{ motion.seatCount }}):
						{{ selectedChoices.map((c) => c.name).join(", ") }}
					</p>
				</div>
				<div v-else-if="isAbstaining" class="selection-summary">
					<p>You are choosing to abstain from this vote.</p>
				</div>

				<!-- Submit button -->
				<div class="submit-section">
					<button
						class="btn btn-primary btn-large"
						:disabled="!canSubmitVote"
						@click="requestSubmitVote"
					>
						{{ isAbstaining ? "Submit Abstention" : "Submit Vote" }}
					</button>
				</div>
			</div>
		</div>

		<!-- Confirmation Modal -->
		<div v-if="showConfirmModal" class="modal-overlay" @click="cancelConfirm">
			<div class="modal" @click.stop>
				<h3>Confirm Your Vote</h3>
				<div class="modal-content">
					<p v-if="isAbstaining">
						You are about to <strong>abstain</strong> from this vote.
					</p>
					<p v-else>You are about to vote for:</p>
					<ul v-if="!isAbstaining" class="confirm-list">
						<li v-for="choice in selectedChoices" :key="choice.id">
							{{ choice.name }}
						</li>
					</ul>
					<p class="warning-text">
						This action cannot be undone. Your vote is final.
					</p>
					<div v-if="submitError !== null" class="submit-error">
						{{ submitError }}
					</div>
				</div>
				<div class="modal-actions">
					<button
						class="btn btn-secondary"
						:disabled="isSubmitting"
						@click="cancelConfirm"
					>
						Cancel
					</button>
					<button
						class="btn btn-primary"
						:disabled="isSubmitting"
						@click="submitVote"
					>
						{{ isSubmitting ? "Submitting..." : "Confirm Vote" }}
					</button>
				</div>
			</div>
		</div>

		<!-- Success Modal (normal mode) -->
		<div v-if="showSuccessModal" class="modal-overlay">
			<div class="modal success-modal">
				<div class="success-icon">&#10003;</div>
				<h3>Vote Submitted!</h3>
				<p>Your vote has been recorded successfully.</p>
				<button class="btn btn-primary" @click="returnToDashboard">
					Return to Dashboard
				</button>
			</div>
		</div>

		<!-- Kiosk mode logout screen (no remaining open motions) -->
		<VoteSuccessKiosk v-if="showKioskLogout" />
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

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn-secondary {
	background-color: #6c757d;
	color: white;
	margin-bottom: 1.5rem;
}

.btn-secondary:hover:not(:disabled) {
	background-color: #545b62;
}

.btn-primary {
	background-color: #007bff;
	color: white;
}

.btn-primary:hover:not(:disabled) {
	background-color: #0056b3;
}

.btn-large {
	padding: 0.75rem 2rem;
	font-size: 1rem;
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

.time-badge.urgent {
	color: #dc3545;
	background: #ffebee;
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

.cannot-vote-message {
	text-align: center;
	padding: 2rem;
	background: #f8f9fa;
	border-radius: 8px;
	border: 1px solid #dee2e6;
}

.cannot-vote-message p {
	margin: 0 0 1.5rem 0;
	color: #666;
	font-size: 1.1rem;
}

.voting-section {
	border-top: 1px solid #eee;
	padding-top: 2rem;
}

.voting-section h3 {
	margin: 0 0 0.5rem 0;
	color: #2c3e50;
}

.vote-instructions {
	color: #666;
	margin-bottom: 1.5rem;
}

.choices-list {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin-bottom: 1rem;
}

.choice-item {
	display: flex;
	align-items: center;
	padding: 1rem;
	background: #f8f9fa;
	border: 2px solid #dee2e6;
	border-radius: 8px;
	cursor: pointer;
	transition: all 0.2s;
}

.choice-item:hover:not(.disabled) {
	background: #e9ecef;
	border-color: #adb5bd;
}

.choice-item.selected {
	background: #e3f2fd;
	border-color: #007bff;
}

.choice-item.disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.choice-checkbox {
	width: 24px;
	height: 24px;
	border: 2px solid #adb5bd;
	border-radius: 4px;
	margin-right: 1rem;
	display: flex;
	align-items: center;
	justify-content: center;
	background: white;
}

.choice-item.selected .choice-checkbox {
	background: #007bff;
	border-color: #007bff;
}

.checkmark {
	color: white;
	font-size: 14px;
	font-weight: bold;
}

.choice-name {
	font-size: 1rem;
	color: #2c3e50;
}

.abstain-section {
	margin-top: 1rem;
	padding-top: 1rem;
	border-top: 1px dashed #dee2e6;
}

.abstain-item.selected {
	background: #fff3e0;
	border-color: #ff9800;
}

.abstain-item.selected .choice-checkbox {
	background: #ff9800;
	border-color: #ff9800;
}

.selection-summary {
	margin: 1.5rem 0;
	padding: 1rem;
	background: #e8f5e9;
	border-radius: 8px;
}

.selection-summary p {
	margin: 0;
	color: #2e7d32;
}

.submit-section {
	margin-top: 2rem;
	text-align: center;
}

/* Modal styles */
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

.modal h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.modal-content {
	margin-bottom: 1.5rem;
}

.modal-content p {
	margin: 0 0 1rem 0;
	color: #666;
}

.confirm-list {
	margin: 1rem 0;
	padding-left: 1.5rem;
}

.confirm-list li {
	margin-bottom: 0.5rem;
	color: #2c3e50;
	font-weight: 500;
}

.warning-text {
	color: #ff9800;
	font-size: 0.9rem;
	font-style: italic;
}

.submit-error {
	margin-top: 1rem;
	padding: 0.75rem;
	background: #ffebee;
	border-radius: 4px;
	color: #dc3545;
	font-size: 0.9rem;
}

.modal-actions {
	display: flex;
	gap: 1rem;
	justify-content: flex-end;
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

.success-modal p {
	margin-bottom: 1.5rem;
}
</style>
