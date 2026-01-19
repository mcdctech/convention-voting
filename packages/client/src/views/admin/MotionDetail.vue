<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { MotionStatus } from "@mcdc-convention-voting/shared";
import { useCountdownTimer } from "../../composables/useCountdownTimer";
import {
	getMotion,
	getMotionDetailedResults,
	getMotionVoteStats,
	updateMotion,
	updateMotionStatus,
	getPools,
	getChoices,
	createChoice,
	deleteChoice,
	reorderChoices,
} from "../../services/api";
import type {
	MotionDetailedResults,
	MotionVoteStats,
	Pool,
	Choice,
	MotionWithPool,
} from "@mcdc-convention-voting/shared";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();

// Constants
const EMPTY_STRING = "";
const ALL_POOLS_LIMIT = 1000;
const INITIAL_PAGE = 1;
const DECIMAL_RADIX = 10;
const FIRST_INDEX = 0;
const ADJACENT_OFFSET = 1;
const MIN_DURATION = 1;
const MIN_SEAT_COUNT = 1;
const DEFAULT_DURATION = 5;
const DEFAULT_SEAT_COUNT = 1;
const STATS_POLL_INTERVAL_MS = 30000; // 30 seconds
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MIN_COUNTDOWN_SECONDS = 0;

const motion = ref<MotionWithPool | null>(null);
const pools = ref<Pool[]>([]);
const choices = ref<Choice[]>([]);
const loadingPools = ref(false);
const loadingChoices = ref(false);

// Vote statistics
const voteStats = ref<MotionVoteStats | null>(null);
const loadingStats = ref(false);
let statsIntervalId: ReturnType<typeof setInterval> | null = null;
const nextRefreshSeconds = ref(STATS_POLL_INTERVAL_MS / MS_PER_SECOND);
let countdownIntervalId: ReturnType<typeof setInterval> | null = null;

// Detailed results for completed motions
const detailedResults = ref<MotionDetailedResults | null>(null);
const loadingResults = ref(false);
const resultsError = ref<string | null>(null);

// State management
const showStatusModal = ref(false);
const pendingStatus = ref<MotionStatus | null>(null);

// Edit mode for motion title
const editingTitle = ref(false);
const tempTitle = ref(EMPTY_STRING);

const formData = ref({
	name: EMPTY_STRING,
	description: EMPTY_STRING,
	plannedDuration: DEFAULT_DURATION,
	seatCount: DEFAULT_SEAT_COUNT,
	votingPoolId: EMPTY_STRING,
});

const newChoiceName = ref(EMPTY_STRING);

const loading = ref(false);
const saving = ref(false);
const savingChoice = ref(false);
const error = ref<string | null>(null);
const choiceError = ref<string | null>(null);

const canEdit = computed(() => {
	if (motion.value === null) {
		return false;
	}
	return motion.value.status === MotionStatus.NotYetStarted;
});

// Use countdown timer composable
const { remainingTimeString, isTimeUrgent } = useCountdownTimer({
	getVotingEndsAt: () => {
		if (motion.value?.status !== MotionStatus.VotingActive) {
			return null;
		}

		if (motion.value.endOverride !== null) {
			return new Date(motion.value.endOverride);
		}

		const startTime = new Date(motion.value.updatedAt);
		const durationMs =
			motion.value.plannedDuration * SECONDS_PER_MINUTE * MS_PER_SECOND;
		return new Date(startTime.getTime() + durationMs);
	},
});

async function loadPools(): Promise<void> {
	loadingPools.value = true;
	try {
		const response = await getPools(INITIAL_PAGE, ALL_POOLS_LIMIT);
		pools.value = response.data.filter((pool) => !pool.isDisabled);
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load pools";
	} finally {
		loadingPools.value = false;
	}
}

async function loadMotion(): Promise<void> {
	loading.value = true;
	error.value = null;

	const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(motionId)) {
		error.value = "Invalid motion ID";
		loading.value = false;
		return;
	}

	try {
		const response = await getMotion(motionId);
		if (response.data !== undefined) {
			const { data } = response;
			motion.value = data;
			formData.value = {
				name: data.name,
				description: data.description ?? EMPTY_STRING,
				plannedDuration: data.plannedDuration,
				seatCount: data.seatCount,
				votingPoolId:
					data.votingPoolId === null ? EMPTY_STRING : String(data.votingPoolId),
			};
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load motion";
	} finally {
		loading.value = false;
	}
}

async function loadChoices(): Promise<void> {
	loadingChoices.value = true;
	choiceError.value = null;

	const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(motionId)) {
		loadingChoices.value = false;
		return;
	}

	try {
		const response = await getChoices(motionId);
		if (response.data !== undefined) {
			const { data } = response;
			choices.value = data;
		}
	} catch (err) {
		choiceError.value =
			err instanceof Error ? err.message : "Failed to load choices";
	} finally {
		loadingChoices.value = false;
	}
}

async function handleSubmit(): Promise<void> {
	error.value = null;

	if (formData.value.plannedDuration < MIN_DURATION) {
		error.value = "Duration must be at least 1 minute.";
		return;
	}

	if (formData.value.seatCount < MIN_SEAT_COUNT) {
		error.value = "Selection count must be at least 1.";
		return;
	}

	saving.value = true;

	try {
		const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
		const trimmedDescription = formData.value.description.trim();
		const motionData = {
			plannedDuration: formData.value.plannedDuration,
			seatCount: formData.value.seatCount,
			description:
				trimmedDescription === EMPTY_STRING ? undefined : trimmedDescription,
			votingPoolId:
				formData.value.votingPoolId === EMPTY_STRING
					? undefined
					: Number.parseInt(formData.value.votingPoolId, DECIMAL_RADIX),
		};

		await updateMotion(motionId, motionData);
		await loadMotion();
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to update motion";
	} finally {
		saving.value = false;
	}
}

async function handleAddChoice(): Promise<void> {
	if (newChoiceName.value.trim() === EMPTY_STRING) {
		choiceError.value = "Choice name is required.";
		return;
	}

	savingChoice.value = true;
	choiceError.value = null;

	try {
		const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
		await createChoice({
			motionId,
			name: newChoiceName.value.trim(),
		});
		newChoiceName.value = EMPTY_STRING;
		await loadChoices();
	} catch (err) {
		choiceError.value =
			err instanceof Error ? err.message : "Failed to add choice";
	} finally {
		savingChoice.value = false;
	}
}

async function handleDeleteChoice(choiceId: number): Promise<void> {
	choiceError.value = null;

	try {
		await deleteChoice(choiceId);
		await loadChoices();
	} catch (err) {
		choiceError.value =
			err instanceof Error ? err.message : "Failed to delete choice";
	}
}

async function moveChoiceUp(index: number): Promise<void> {
	if (index === FIRST_INDEX) {
		return;
	}

	const newOrder = [...choices.value];
	const previousIndex = index - ADJACENT_OFFSET;
	[newOrder[previousIndex], newOrder[index]] = [
		newOrder[index],
		newOrder[previousIndex],
	];

	const choiceIds = newOrder.map((c) => c.id);
	const motionId = Number.parseInt(props.id, DECIMAL_RADIX);

	try {
		await reorderChoices(motionId, choiceIds);
		await loadChoices();
	} catch (err) {
		choiceError.value =
			err instanceof Error ? err.message : "Failed to reorder choices";
	}
}

async function moveChoiceDown(index: number): Promise<void> {
	const lastIndex = choices.value.length - ADJACENT_OFFSET;
	if (index >= lastIndex) {
		return;
	}

	const newOrder = [...choices.value];
	const nextIndex = index + ADJACENT_OFFSET;
	[newOrder[index], newOrder[nextIndex]] = [
		newOrder[nextIndex],
		newOrder[index],
	];

	const choiceIds = newOrder.map((c) => c.id);
	const motionId = Number.parseInt(props.id, DECIMAL_RADIX);

	try {
		await reorderChoices(motionId, choiceIds);
		await loadChoices();
	} catch (err) {
		choiceError.value =
			err instanceof Error ? err.message : "Failed to reorder choices";
	}
}

function goBack(): void {
	if (motion.value === null) {
		void router.push("/admin/meetings");
		return;
	}
	void router.push(`/admin/meetings/${motion.value.meetingId}/motions`);
}

/**
 * Load vote statistics if motion is voting_active
 */
async function loadVoteStats(): Promise<void> {
	if (motion.value?.status !== MotionStatus.VotingActive) {
		voteStats.value = null;
		return;
	}

	loadingStats.value = true;
	try {
		const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
		const response = await getMotionVoteStats(motionId);
		if (response.data !== undefined) {
			voteStats.value = response.data;
		}
	} catch (err) {
		// eslint-disable-next-line no-console -- Error logging for debugging
		console.error("Failed to load vote stats:", err);
	} finally {
		loadingStats.value = false;
	}
}

/**
 * Start polling for vote stats
 */
function startStatsPolling(): void {
	if (motion.value?.status === MotionStatus.VotingActive) {
		void loadVoteStats();
		startRefreshCountdown();
		statsIntervalId = setInterval(() => {
			void loadVoteStats();
			startRefreshCountdown();
		}, STATS_POLL_INTERVAL_MS);
	}
}

/**
 * Stop polling for vote stats
 */
function stopStatsPolling(): void {
	if (statsIntervalId !== null) {
		clearInterval(statsIntervalId);
		statsIntervalId = null;
	}
	stopRefreshCountdown();
}

/**
 * Start countdown to next refresh
 */
function startRefreshCountdown(): void {
	stopRefreshCountdown(); // Stop any existing countdown first
	nextRefreshSeconds.value = STATS_POLL_INTERVAL_MS / MS_PER_SECOND;
	countdownIntervalId = setInterval(() => {
		if (nextRefreshSeconds.value > MIN_COUNTDOWN_SECONDS) {
			nextRefreshSeconds.value -= 1;
		}
	}, MS_PER_SECOND);
}

/**
 * Stop countdown to next refresh
 */
function stopRefreshCountdown(): void {
	if (countdownIntervalId !== null) {
		clearInterval(countdownIntervalId);
		countdownIntervalId = null;
	}
}

/**
 * Format time for display
 */
function formatTime(date: Date): string {
	return new Date(date).toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/**
 * Format date and time for display
 */
function formatDateTime(date: Date): string {
	return new Date(date).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Load detailed results if motion is voting_complete
 */
async function loadDetailedResults(): Promise<void> {
	if (motion.value?.status !== MotionStatus.VotingComplete) {
		detailedResults.value = null;
		return;
	}

	loadingResults.value = true;
	resultsError.value = null;
	try {
		const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
		const response = await getMotionDetailedResults(motionId);
		if (response.data !== undefined) {
			detailedResults.value = response.data;
		}
	} catch (err) {
		resultsError.value =
			err instanceof Error ? err.message : "Failed to load results";
	} finally {
		loadingResults.value = false;
	}
}

/**
 * Request to start voting (opens confirmation modal)
 */
function requestStartVoting(): void {
	pendingStatus.value = MotionStatus.VotingActive;
	showStatusModal.value = true;
}

/**
 * Request to end voting (opens confirmation modal)
 */
function requestEndVoting(): void {
	pendingStatus.value = MotionStatus.VotingComplete;
	showStatusModal.value = true;
}

/**
 * Cancel status change
 */
function cancelStatusChange(): void {
	showStatusModal.value = false;
	pendingStatus.value = null;
}

/**
 * Handle status change after confirmation
 */
async function handleStatusChange(): Promise<void> {
	if (pendingStatus.value === null || motion.value === null) {
		return;
	}

	showStatusModal.value = false;
	const newStatus = pendingStatus.value;
	pendingStatus.value = null;

	try {
		const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
		await updateMotionStatus(motionId, { status: newStatus });

		// Reload motion to get updated status
		await loadMotion();

		// Trigger appropriate polling based on new status
		if (newStatus === MotionStatus.VotingActive) {
			startStatsPolling();
			void loadDetailedResults(); // Clear any old results
		} else if (newStatus === MotionStatus.VotingComplete) {
			stopStatsPolling();
			void loadDetailedResults();
		}
	} catch (err) {
		// Show error to user
		// eslint-disable-next-line no-alert -- User-facing error notification for status change failures
		alert(
			err instanceof Error
				? err.message
				: "Failed to update motion status. Please try again.",
		);

		// Reload motion to ensure UI is in sync
		await loadMotion();
	}
}

/**
 * Get status label for display
 */
function getStatusLabel(status: MotionStatus): string {
	switch (status) {
		case MotionStatus.NotYetStarted: {
			return "Not Yet Started";
		}
		case MotionStatus.VotingActive: {
			return "Voting Active";
		}
		case MotionStatus.VotingComplete: {
			return "Voting Complete";
		}
	}
}

/**
 * Get CSS class for status badge
 */
function getStatusClass(status: MotionStatus): string {
	switch (status) {
		case MotionStatus.NotYetStarted: {
			return "status-not-started";
		}
		case MotionStatus.VotingActive: {
			return "status-voting-active";
		}
		case MotionStatus.VotingComplete: {
			return "status-complete";
		}
	}
}

/**
 * Start editing the motion title
 */
function startEditingTitle(): void {
	if (motion.value === null) {
		return;
	}
	tempTitle.value = motion.value.name;
	editingTitle.value = true;
}

/**
 * Cancel editing the motion title
 */
function cancelEditingTitle(): void {
	editingTitle.value = false;
	tempTitle.value = EMPTY_STRING;
}

/**
 * Save the edited motion title
 */
async function saveTitle(): Promise<void> {
	if (tempTitle.value.trim() === EMPTY_STRING) {
		error.value = "Motion name cannot be empty.";
		return;
	}

	if (motion.value === null) {
		error.value = "Motion data not loaded.";
		return;
	}

	saving.value = true;
	error.value = null;

	try {
		const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
		await updateMotion(motionId, {
			name: tempTitle.value.trim(),
			plannedDuration: motion.value.plannedDuration,
			seatCount: motion.value.seatCount,
			description: motion.value.description ?? undefined,
			votingPoolId: motion.value.votingPoolId ?? undefined,
		});
		await loadMotion();
		editingTitle.value = false;
		tempTitle.value = EMPTY_STRING;
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to update motion name";
	} finally {
		saving.value = false;
	}
}

onMounted(() => {
	void loadPools();
	void loadMotion().then(() => {
		startStatsPolling(); // For voting_active
		void loadDetailedResults(); // For voting_complete
	});
	void loadChoices();
});

onUnmounted(() => {
	stopStatsPolling();
});

watch(
	() => motion.value?.status,
	(newStatus) => {
		stopStatsPolling();
		if (newStatus === MotionStatus.VotingActive) {
			startStatsPolling();
			detailedResults.value = null;
		} else if (newStatus === MotionStatus.VotingComplete) {
			voteStats.value = null;
			void loadDetailedResults();
		} else {
			voteStats.value = null;
			detailedResults.value = null;
		}
	},
);
</script>

<template>
	<div class="motion-edit">
		<div class="back-button-container">
			<button class="btn btn-secondary btn-small" @click="goBack">
				&larr; Back to Motions
			</button>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading motion...</div>

		<template v-else>
			<!-- Motion Title -->
			<div v-if="motion" class="motion-title-section">
				<div v-if="editingTitle" class="title-edit-mode">
					<input
						v-model="tempTitle"
						type="text"
						class="title-input"
						placeholder="Motion name"
						@keyup.enter="saveTitle"
						@keyup.esc="cancelEditingTitle"
					/>
					<div class="title-actions">
						<button
							class="btn btn-primary btn-small"
							:disabled="saving"
							@click="saveTitle"
						>
							{{ saving ? "Saving..." : "Save" }}
						</button>
						<button
							class="btn btn-secondary btn-small"
							@click="cancelEditingTitle"
						>
							Cancel
						</button>
					</div>
				</div>
				<div v-else class="title-display-mode">
					<h1 class="motion-title">{{ motion.name }}</h1>
					<div class="title-actions">
						<span
							v-if="motion.status === MotionStatus.VotingActive"
							class="time-remaining-badge"
							:class="{ urgent: isTimeUrgent }"
						>
							{{ remainingTimeString }}
						</span>
						<span
							v-if="motion.status === MotionStatus.VotingComplete"
							class="status-badge"
							:class="getStatusClass(motion.status)"
						>
							{{ getStatusLabel(motion.status) }}
						</span>
						<button
							v-if="motion.status === MotionStatus.NotYetStarted"
							class="btn btn-secondary btn-small"
							@click="startEditingTitle"
						>
							Edit Name
						</button>
						<button
							v-if="motion.status === MotionStatus.VotingActive"
							class="btn btn-warning"
							@click="requestEndVoting"
						>
							End Voting
						</button>
					</div>
				</div>
			</div>

			<!-- State Management Section -->
			<div
				v-if="motion && motion.status === MotionStatus.NotYetStarted"
				class="state-management-section"
			>
				<h3>Motion Status</h3>
				<div class="status-row">
					<span class="status-badge" :class="getStatusClass(motion.status)">
						{{ getStatusLabel(motion.status) }}
					</span>
					<div class="status-actions">
						<button class="btn btn-primary" @click="requestStartVoting">
							Start Voting
						</button>
					</div>
				</div>
			</div>

			<!-- STATE 1: not_yet_started - Configuration Mode -->
			<template v-if="motion?.status === MotionStatus.NotYetStarted">
				<form class="motion-form" @submit.prevent="handleSubmit">
					<h3 class="section-header">Details</h3>

					<div class="form-group">
						<label for="description">
							Description
							<span class="optional">(optional)</span>
						</label>
						<textarea
							id="description"
							v-model="formData.description"
							rows="3"
							:disabled="!canEdit"
						/>
					</div>

					<div class="form-group">
						<label for="plannedDuration">
							Planned Duration (minutes) <span class="required">*</span>
						</label>
						<input
							id="plannedDuration"
							v-model.number="formData.plannedDuration"
							type="number"
							min="1"
							required
							:disabled="!canEdit"
						/>
					</div>

					<div class="form-group">
						<label for="seatCount"> Selection Count </label>
						<input
							id="seatCount"
							v-model.number="formData.seatCount"
							type="number"
							min="1"
							:disabled="!canEdit"
						/>
					</div>

					<div class="form-group">
						<label for="votingPoolId">
							Voting Pool
							<span class="optional">(optional)</span>
						</label>
						<select
							id="votingPoolId"
							v-model="formData.votingPoolId"
							:disabled="loadingPools || !canEdit"
						>
							<option value="">
								{{
									loadingPools
										? "Loading pools..."
										: "Use meeting's quorum pool"
								}}
							</option>
							<option v-for="pool in pools" :key="pool.id" :value="pool.id">
								{{ pool.poolName }}
							</option>
						</select>
					</div>

					<h3 class="section-header">Choices</h3>

					<!-- Choices Field -->
					<div class="form-group choices-group">
						<p class="field-description">
							Define the options voters can choose from. At least one choice is
							required.
						</p>

						<div v-if="choiceError" class="error-inline">
							{{ choiceError }}
						</div>

						<div v-if="loadingChoices" class="loading-small">
							Loading choices...
						</div>

						<div v-else-if="choices.length === 0" class="empty-choices">
							No choices added yet. Add at least one choice below.
						</div>

						<ul v-else class="choices-list">
							<li v-for="(choice, index) in choices" :key="choice.id">
								<span class="choice-name">{{ choice.name }}</span>
								<div class="choice-actions">
									<button
										type="button"
										class="btn btn-small"
										:disabled="index === 0"
										title="Move up"
										@click="moveChoiceUp(index)"
									>
										&uarr;
									</button>
									<button
										type="button"
										class="btn btn-small"
										:disabled="index >= choices.length - 1"
										title="Move down"
										@click="moveChoiceDown(index)"
									>
										&darr;
									</button>
									<button
										type="button"
										class="btn btn-small btn-danger"
										title="Delete"
										@click="handleDeleteChoice(choice.id)"
									>
										Delete
									</button>
								</div>
							</li>
						</ul>

						<div class="add-choice-form">
							<input
								v-model="newChoiceName"
								type="text"
								placeholder="Enter choice name"
								:disabled="savingChoice"
								@keydown.enter.prevent="handleAddChoice"
							/>
							<button
								type="button"
								class="btn btn-primary btn-small"
								:disabled="savingChoice"
								@click="handleAddChoice"
							>
								{{ savingChoice ? "Adding..." : "Add Choice" }}
							</button>
						</div>
					</div>

					<div v-if="canEdit" class="form-actions">
						<button type="submit" class="btn btn-primary" :disabled="saving">
							{{ saving ? "Saving..." : "Save Changes" }}
						</button>
					</div>
				</form>
			</template>

			<!-- STATE 2: voting_active - Monitoring Mode -->
			<template v-else-if="motion?.status === MotionStatus.VotingActive">
				<!-- Motion Info Card (read-only) -->
				<div class="motion-info-card">
					<h3>Motion Details</h3>
					<div v-if="motion.description" class="info-row">
						<span class="info-label">Description:</span>
						<span class="info-value">{{ motion.description }}</span>
					</div>
					<div class="info-row">
						<span class="info-label">Selection Count:</span>
						<span class="info-value">{{ motion.seatCount }}</span>
					</div>
					<div class="info-row">
						<span class="info-label">Duration:</span>
						<span class="info-value">{{ motion.plannedDuration }} minutes</span>
					</div>
					<div v-if="motion.votingPoolName" class="info-row">
						<span class="info-label">Voting Pool:</span>
						<span class="info-value">{{ motion.votingPoolName }}</span>
					</div>
					<div v-if="motion.votingStartedAt" class="info-row">
						<span class="info-label">Started On:</span>
						<span class="info-value">{{
							formatDateTime(motion.votingStartedAt)
						}}</span>
					</div>
				</div>

				<!-- Vote Statistics Section -->
				<div class="vote-stats-section">
					<h3>Live Vote Count</h3>

					<div v-if="loadingStats && !voteStats" class="loading-small">
						Loading vote statistics...
					</div>

					<div v-else-if="voteStats" class="stats-content">
						<div class="stat-item">
							<span class="stat-label">Ballots Cast:</span>
							<span class="stat-value">{{ voteStats.totalVotes }}</span>
						</div>

						<div class="stat-item">
							<span class="stat-label">Eligible Voters:</span>
							<span class="stat-value">{{ voteStats.eligibleVoters }}</span>
						</div>

						<div class="stat-item large">
							<span class="stat-label">Participation Rate:</span>
							<span class="stat-value-large">
								{{ voteStats.participationRate.toFixed(1) }}%
							</span>
						</div>

						<div class="progress-bar-container">
							<div
								class="progress-bar-fill"
								:style="{ width: `${voteStats.participationRate}%` }"
							/>
						</div>

						<div class="stats-footer">
							<span class="update-time">
								Last updated: {{ formatTime(voteStats.lastUpdated) }}
							</span>
							<span class="refresh-note">
								Next refresh in {{ nextRefreshSeconds }}
								{{ nextRefreshSeconds === 1 ? "second" : "seconds" }}
							</span>
						</div>
					</div>

					<div class="privacy-notice">
						<strong>Privacy:</strong> Only total ballot count is visible. No
						information about vote content, choices, or abstentions is shown.
					</div>
				</div>
			</template>

			<!-- STATE 3: voting_complete - Results Mode -->
			<template v-else-if="motion?.status === MotionStatus.VotingComplete">
				<!-- Motion Info Card (read-only) -->
				<div class="motion-info-card">
					<h3>Motion Details</h3>
					<div v-if="motion.description" class="info-row">
						<span class="info-label">Description:</span>
						<span class="info-value">{{ motion.description }}</span>
					</div>
					<div class="info-row">
						<span class="info-label">Selection Count:</span>
						<span class="info-value">{{ motion.seatCount }}</span>
					</div>
					<div class="info-row">
						<span class="info-label">Duration:</span>
						<span class="info-value">{{ motion.plannedDuration }} minutes</span>
					</div>
					<div v-if="motion.votingPoolName" class="info-row">
						<span class="info-label">Voting Pool:</span>
						<span class="info-value">{{ motion.votingPoolName }}</span>
					</div>
					<div v-if="motion.votingStartedAt" class="info-row">
						<span class="info-label">Started On:</span>
						<span class="info-value">{{
							formatDateTime(motion.votingStartedAt)
						}}</span>
					</div>
					<div v-if="motion.votingEndedAt" class="info-row">
						<span class="info-label">Ended On:</span>
						<span class="info-value">{{
							formatDateTime(motion.votingEndedAt)
						}}</span>
					</div>
				</div>

				<!-- Detailed Results Section -->
				<div class="detailed-results-section">
					<h3>Final Results</h3>

					<div v-if="resultsError" class="error">{{ resultsError }}</div>

					<div v-if="loadingResults && !detailedResults" class="loading-small">
						Loading results...
					</div>

					<div v-else-if="detailedResults" class="results-content">
						<!-- Summary Statistics -->
						<div class="results-summary">
							<div class="summary-stat">
								<span class="stat-label">Total Ballots Cast:</span>
								<span class="stat-value">{{
									detailedResults.totalVotesIncludingAbstentions
								}}</span>
							</div>

							<div class="summary-stat">
								<span class="stat-label">Eligible Voters:</span>
								<span class="stat-value">{{
									detailedResults.eligibleVoters
								}}</span>
							</div>

							<div class="summary-stat highlight">
								<span class="stat-label">Participation Rate:</span>
								<span class="stat-value-large">
									{{ detailedResults.participationRate.toFixed(1) }}%
								</span>
							</div>
						</div>

						<!-- Choice Results -->
						<div class="choice-results">
							<h4>
								Vote Distribution
								<span v-if="detailedResults.seatCount > 1" class="seats-info">
									(Top {{ detailedResults.seatCount }} win)
								</span>
							</h4>

							<div class="results-table">
								<div
									v-for="result in detailedResults.choiceResults"
									:key="result.choiceId"
									class="result-row"
									:class="{ winner: result.isWinner }"
								>
									<div class="result-header">
										<span class="choice-name">
											{{ result.choiceName }}
											<span v-if="result.isWinner" class="winner-badge"
												>Winner</span
											>
										</span>
										<span class="vote-count">
											{{ result.voteCount }} votes ({{
												result.percentage.toFixed(1)
											}}%)
										</span>
									</div>

									<div class="result-bar-container">
										<div
											class="result-bar-fill"
											:class="{ winner: result.isWinner }"
											:style="{ width: `${result.percentage}%` }"
										/>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</template>
		</template>

		<!-- Status Change Confirmation Modal -->
		<div
			v-if="showStatusModal"
			class="modal-overlay"
			@click="cancelStatusChange"
		>
			<div class="modal-content" @click.stop>
				<h3>
					{{
						pendingStatus === MotionStatus.VotingActive
							? "Confirm Start Voting"
							: "Confirm End Voting"
					}}
				</h3>
				<p
					v-if="pendingStatus === MotionStatus.VotingActive"
					class="modal-message"
				>
					Are you sure you want to start voting on this motion?
					<strong>Once started, the motion cannot be edited.</strong>
				</p>
				<p
					v-else-if="pendingStatus === MotionStatus.VotingComplete"
					class="modal-message"
				>
					Are you sure you want to end voting on this motion?
					<strong
						>Once ended, voters will no longer be able to cast ballots.</strong
					>
				</p>
				<div class="modal-actions">
					<button
						v-if="pendingStatus === MotionStatus.VotingActive"
						class="btn btn-primary"
						@click="handleStatusChange"
					>
						Yes, Start Voting
					</button>
					<button
						v-if="pendingStatus === MotionStatus.VotingComplete"
						class="btn btn-warning"
						@click="handleStatusChange"
					>
						Yes, End Voting
					</button>
					<button class="btn btn-secondary" @click="cancelStatusChange">
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.motion-edit {
	max-width: 800px;
}

.back-button-container {
	margin-bottom: 1.5rem;
}

/* Motion Title Section - Prominent Display */
.motion-title-section {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	margin-bottom: 2rem;
}

.title-display-mode {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 1.5rem;
}

.motion-title {
	margin: 0;
	font-size: 2rem;
	font-weight: 700;
	color: #1976d2;
	line-height: 1.2;
	flex: 1;
}

.title-edit-mode {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.title-input {
	width: 100%;
	padding: 0.75rem 1rem;
	border: 2px solid #1976d2;
	border-radius: 4px;
	font-size: 1.5rem;
	font-weight: 600;
	font-family: inherit;
}

.title-input:focus {
	outline: none;
	border-color: #1565c0;
	box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.1);
}

.title-actions {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

/* Section Headers */
.section-header {
	margin: 2rem 0 1rem 0;
	font-size: 1.25rem;
	font-weight: 600;
	color: #2c3e50;
	border-bottom: 2px solid #e0e0e0;
	padding-bottom: 0.5rem;
}

.section-header:first-child {
	margin-top: 0;
}

.header {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin-bottom: 1.5rem;
}

.header h2 {
	margin: 0;
	color: #2c3e50;
}

.error {
	padding: 1rem;
	margin-bottom: 1rem;
	background-color: #ffebee;
	color: #c62828;
	border-radius: 4px;
}

.warning {
	padding: 1rem;
	margin-bottom: 1rem;
	background-color: #fff3e0;
	color: #e65100;
	border-radius: 4px;
}

.warning-small {
	padding: 0.5rem;
	margin-bottom: 0.5rem;
	background-color: #fff3e0;
	color: #e65100;
	border-radius: 4px;
	font-size: 0.875rem;
}

.loading {
	text-align: center;
	padding: 2rem;
	color: #666;
}

.loading-small {
	padding: 1rem;
	color: #666;
	font-size: 0.875rem;
}

.motion-form {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	margin-bottom: 2rem;
}

.form-group {
	margin-bottom: 1.5rem;
}

.form-group.choices-group {
	margin-top: 0;
}

.form-group label {
	display: block;
	margin-bottom: 0.5rem;
	font-weight: 500;
	color: #2c3e50;
}

.required {
	color: #c62828;
}

.optional {
	font-size: 0.875rem;
	font-weight: 400;
	color: #757575;
}

.field-description {
	margin: 0 0 1rem 0;
	font-size: 0.875rem;
	color: #666;
	line-height: 1.5;
}

.error-inline {
	padding: 0.75rem;
	margin-bottom: 1rem;
	background-color: #ffebee;
	color: #c62828;
	border-radius: 4px;
	font-size: 0.875rem;
}

.form-group input,
.form-group textarea,
.form-group select {
	width: 100%;
	padding: 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	font-size: 1rem;
	font-family: inherit;
}

.form-group input:disabled,
.form-group textarea:disabled,
.form-group select:disabled {
	background-color: #f5f5f5;
	cursor: not-allowed;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
	outline: none;
	border-color: #1976d2;
}

.form-actions {
	display: flex;
	gap: 1rem;
	margin-top: 2rem;
}

.empty-choices {
	padding: 1rem;
	color: #666;
	font-style: italic;
}

.choices-list {
	list-style: none;
	padding: 0;
	margin: 0 0 1.5rem 0;
}

.choices-list li {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	margin-bottom: 0.5rem;
}

.choice-name {
	font-weight: 500;
}

.choice-actions {
	display: flex;
	gap: 0.25rem;
}

.add-choice-form {
	display: flex;
	gap: 0.5rem;
}

.add-choice-form input {
	flex: 1;
	padding: 0.5rem 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	font-size: 0.875rem;
}

.add-choice-form input:focus {
	outline: none;
	border-color: #1976d2;
}

.btn {
	padding: 0.75rem 1.5rem;
	border: none;
	border-radius: 4px;
	font-size: 1rem;
	cursor: pointer;
	transition: background-color 0.2s;
}

.btn:disabled {
	background-color: #bdbdbd;
	cursor: not-allowed;
}

.btn-primary {
	background-color: #1976d2;
	color: white;
}

.btn-primary:hover:not(:disabled) {
	background-color: #1565c0;
}

.btn-secondary {
	background-color: #757575;
	color: white;
}

.btn-secondary:hover:not(:disabled) {
	background-color: #616161;
}

.btn-small {
	padding: 0.25rem 0.5rem;
	font-size: 0.8125rem;
}

.btn-danger {
	background-color: #dc3545;
	color: white;
}

.btn-danger:hover:not(:disabled) {
	background-color: #c82333;
}

/* Vote statistics styles */
.vote-stats-section {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	margin-bottom: 2rem;
	border-left: 4px solid #ffc107;
}

.stats-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1.5rem;
}

.vote-stats-section h3 {
	margin: 0;
	color: #2c3e50;
}

.time-remaining-badge {
	background: #2196f3;
	color: white;
	padding: 0.5rem 1rem;
	border-radius: 20px;
	font-size: 1rem;
	font-weight: 600;
	display: inline-block;
}

.time-remaining-badge.urgent {
	background: #f44336;
	animation: pulse 1s infinite;
}

@keyframes pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.7;
	}
}

.stats-content {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.stat-item {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.75rem;
	background: #f8f9fa;
	border-radius: 4px;
}

.stat-item.large {
	padding: 1rem;
	background: #e3f2fd;
	border: 2px solid #2196f3;
}

.stat-label {
	font-weight: 500;
	color: #666;
}

.stat-value {
	font-size: 1.25rem;
	font-weight: 600;
	color: #2c3e50;
}

.stat-value-large {
	font-size: 2rem;
	font-weight: 700;
	color: #1976d2;
}

.progress-bar-container {
	width: 100%;
	height: 24px;
	background: #e0e0e0;
	border-radius: 12px;
	overflow: hidden;
	margin-top: 1rem;
}

.progress-bar-fill {
	height: 100%;
	background: linear-gradient(90deg, #4caf50 0%, #8bc34a 100%);
	transition: width 0.5s ease;
	border-radius: 12px;
}

.stats-footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-top: 1rem;
	padding-top: 1rem;
	border-top: 1px solid #e0e0e0;
}

.update-time {
	font-size: 0.875rem;
	color: #666;
}

.refresh-note {
	font-size: 0.875rem;
	color: #999;
	font-style: italic;
}

.privacy-notice {
	margin-top: 1rem;
	padding: 0.75rem;
	background: #fff3e0;
	border-radius: 4px;
	font-size: 0.875rem;
	color: #e65100;
}

.privacy-notice strong {
	font-weight: 600;
}

.loading-small {
	font-size: 0.875rem;
	color: #666;
	padding: 0.5rem 0;
}

/* Detailed results styles */
.detailed-results-section {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	margin-bottom: 2rem;
	border-left: 4px solid #4caf50;
}

.detailed-results-section h3 {
	margin: 0 0 1.5rem 0;
	color: #2c3e50;
}

.results-content {
	display: flex;
	flex-direction: column;
	gap: 2rem;
}

.results-summary {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.summary-stat {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.75rem;
	background: #f8f9fa;
	border-radius: 4px;
}

.summary-stat.highlight {
	padding: 1rem;
	background: #e8f5e9;
	border: 2px solid #4caf50;
}

.choice-results h4 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.seats-info {
	font-size: 0.875rem;
	font-weight: 400;
	color: #666;
}

.results-table {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.result-row {
	padding: 1rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	background: #fafafa;
}

.result-row.winner {
	background: #e8f5e9;
	border-color: #4caf50;
	border-width: 2px;
}

.result-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 0.5rem;
}

.result-row .choice-name {
	font-weight: 600;
	font-size: 1rem;
	color: #2c3e50;
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.winner-badge {
	background: #4caf50;
	color: white;
	padding: 0.25rem 0.75rem;
	border-radius: 12px;
	font-size: 0.75rem;
	font-weight: 600;
	text-transform: uppercase;
}

.result-row .vote-count {
	font-size: 1rem;
	font-weight: 500;
	color: #666;
}

.result-bar-container {
	width: 100%;
	height: 32px;
	background: #e0e0e0;
	border-radius: 4px;
	overflow: hidden;
}

.result-bar-fill {
	height: 100%;
	background: linear-gradient(90deg, #2196f3 0%, #64b5f6 100%);
	transition: width 0.5s ease;
	border-radius: 4px;
}

.result-bar-fill.winner {
	background: linear-gradient(90deg, #4caf50 0%, #81c784 100%);
}

/* State management section */
.state-management-section {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	margin-bottom: 2rem;
}

.state-management-section h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.status-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.status-badge {
	padding: 0.5rem 1rem;
	border-radius: 4px;
	font-weight: 600;
	font-size: 0.875rem;
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.status-not-started {
	background: #e0e0e0;
	color: #666;
}

.status-voting-active {
	background: #fff3e0;
	color: #e65100;
}

.status-complete {
	background: #e8f5e9;
	color: #2e7d32;
}

.status-actions {
	display: flex;
	gap: 0.75rem;
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
	justify-content: center;
	align-items: center;
	z-index: 1000;
}

.modal-content {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	max-width: 500px;
	width: 90%;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.modal-content h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.modal-message {
	margin: 0 0 1.5rem 0;
	color: #666;
	line-height: 1.5;
}

.modal-message strong {
	color: #d32f2f;
	font-weight: 600;
}

.modal-actions {
	display: flex;
	gap: 0.75rem;
	justify-content: flex-end;
}

.btn-warning {
	background: #ff9800;
	color: white;
}

.btn-warning:hover {
	background: #f57c00;
}

.btn-secondary {
	background: #9e9e9e;
	color: white;
}

.btn-secondary:hover {
	background: #757575;
}

/* Motion info card - read-only display */
.motion-info-card {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	margin-bottom: 2rem;
}

.motion-info-card h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.info-row {
	display: flex;
	margin-bottom: 0.75rem;
	gap: 1rem;
}

.info-label {
	font-weight: 600;
	color: #666;
	min-width: 120px;
}

.info-value {
	color: #2c3e50;
	flex: 1;
}

.status-with-action {
	display: flex;
	align-items: center;
	gap: 1rem;
	flex: 1;
}

/* Choices reference - read-only list */
.choices-reference-section {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	margin-bottom: 2rem;
}

.choices-reference-section h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.choices-list-readonly {
	list-style: disc;
	padding-left: 1.5rem;
	margin: 0;
}

.choices-list-readonly li {
	padding: 0.5rem 0;
	color: #666;
}
</style>
