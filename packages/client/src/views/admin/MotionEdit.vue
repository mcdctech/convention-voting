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

const motion = ref<MotionWithPool | null>(null);
const pools = ref<Pool[]>([]);
const choices = ref<Choice[]>([]);
const loadingPools = ref(false);
const loadingChoices = ref(false);

// Vote statistics
const voteStats = ref<MotionVoteStats | null>(null);
const loadingStats = ref(false);
let statsIntervalId: ReturnType<typeof setInterval> | null = null;

// Detailed results for completed motions
const detailedResults = ref<MotionDetailedResults | null>(null);
const loadingResults = ref(false);
const resultsError = ref<string | null>(null);

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

	if (formData.value.name.trim() === EMPTY_STRING) {
		error.value = "Name is required.";
		return;
	}

	if (formData.value.plannedDuration < MIN_DURATION) {
		error.value = "Duration must be at least 1 minute.";
		return;
	}

	if (formData.value.seatCount < MIN_SEAT_COUNT) {
		error.value = "Seat count must be at least 1.";
		return;
	}

	saving.value = true;

	try {
		const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
		const trimmedDescription = formData.value.description.trim();
		const motionData = {
			name: formData.value.name.trim(),
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
		statsIntervalId = setInterval(() => {
			void loadVoteStats();
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
		<div class="header">
			<button class="btn btn-secondary btn-small" @click="goBack">
				&larr; Back to Motions
			</button>
			<h2>Edit Motion</h2>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading motion...</div>

		<template v-else>
			<div v-if="!canEdit" class="warning">
				This motion cannot be edited because voting has already started.
			</div>

			<form class="motion-form" @submit.prevent="handleSubmit">
				<div class="form-group">
					<label for="name"> Name <span class="required">*</span> </label>
					<input
						id="name"
						v-model="formData.name"
						type="text"
						required
						:disabled="!canEdit"
					/>
				</div>

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
					<label for="seatCount"> Seat Count </label>
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
								loadingPools ? "Loading pools..." : "Use meeting's quorum pool"
							}}
						</option>
						<option v-for="pool in pools" :key="pool.id" :value="pool.id">
							{{ pool.poolName }}
						</option>
					</select>
				</div>

				<div v-if="canEdit" class="form-actions">
					<button type="submit" class="btn btn-primary" :disabled="saving">
						{{ saving ? "Saving..." : "Save Changes" }}
					</button>
				</div>
			</form>

			<!-- Vote Statistics Section -->
			<div
				v-if="motion?.status === MotionStatus.VotingActive"
				class="vote-stats-section"
			>
				<div class="stats-header">
					<h3>Live Vote Count</h3>
					<span class="time-remaining-badge" :class="{ urgent: isTimeUrgent }">
						{{ remainingTimeString }}
					</span>
				</div>

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
						<span class="refresh-note">Updates every 30 seconds</span>
					</div>
				</div>

				<div class="privacy-notice">
					<strong>Privacy:</strong> Only total ballot count is visible. No
					information about vote content, choices, or abstentions is shown.
				</div>
			</div>

			<!-- Detailed Results Section (voting_complete only) -->
			<div
				v-if="motion?.status === MotionStatus.VotingComplete"
				class="detailed-results-section"
			>
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
							<span class="stat-label">Votes for Choices:</span>
							<span class="stat-value">{{
								detailedResults.totalVotesForChoices
							}}</span>
						</div>

						<div class="summary-stat">
							<span class="stat-label">Abstentions:</span>
							<span class="stat-value">
								{{ detailedResults.abstentionCount }}
								({{ detailedResults.abstentionPercentage.toFixed(1) }}%)
							</span>
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

			<!-- Choices Section -->
			<div class="choices-section">
				<h3>Choices</h3>

				<div v-if="choiceError" class="error">
					{{ choiceError }}
				</div>

				<div v-if="!canEdit" class="warning-small">
					Choices cannot be modified because voting has already started.
				</div>

				<div v-if="loadingChoices" class="loading-small">
					Loading choices...
				</div>

				<div v-else-if="choices.length === 0" class="empty-choices">
					No choices added yet.
				</div>

				<ul v-else class="choices-list">
					<li v-for="(choice, index) in choices" :key="choice.id">
						<span class="choice-name">{{ choice.name }}</span>
						<div v-if="canEdit" class="choice-actions">
							<button
								class="btn btn-small"
								:disabled="index === 0"
								title="Move up"
								@click="moveChoiceUp(index)"
							>
								&uarr;
							</button>
							<button
								class="btn btn-small"
								:disabled="index >= choices.length - 1"
								title="Move down"
								@click="moveChoiceDown(index)"
							>
								&darr;
							</button>
							<button
								class="btn btn-small btn-danger"
								title="Delete"
								@click="handleDeleteChoice(choice.id)"
							>
								Delete
							</button>
						</div>
					</li>
				</ul>

				<form
					v-if="canEdit"
					class="add-choice-form"
					@submit.prevent="handleAddChoice"
				>
					<input
						v-model="newChoiceName"
						type="text"
						placeholder="Enter choice name"
						:disabled="savingChoice"
					/>
					<button
						type="submit"
						class="btn btn-primary"
						:disabled="savingChoice"
					>
						{{ savingChoice ? "Adding..." : "Add Choice" }}
					</button>
				</form>
			</div>
		</template>
	</div>
</template>

<style scoped>
.motion-edit {
	max-width: 800px;
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

.choices-section {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.choices-section h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
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
</style>
