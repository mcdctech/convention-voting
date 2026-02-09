<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { MotionStatus } from "@mcdc-convention-voting/shared";
import {
	getWatcherMotionDetail,
	getWatcherMotionVoters,
} from "../../services/api";
import type {
	WatcherMotionDetail,
	WatcherMotionVoter,
} from "@mcdc-convention-voting/shared";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();

const DECIMAL_RADIX = 10;
const PERCENTAGE_PRECISION = 1;
const PERCENTAGE_MULTIPLIER = 100;
const EMPTY_ARRAY_LENGTH = 0;
const ZERO_DIVISOR = 0;

const motion = ref<WatcherMotionDetail | null>(null);
const voters = ref<WatcherMotionVoter[]>([]);
const loading = ref(false);
const loadingVoters = ref(false);
const error = ref<string | null>(null);
const showVoters = ref(false);

const isNotStarted = computed(
	() => motion.value?.status === MotionStatus.NotYetStarted,
);
const isActive = computed(
	() => motion.value?.status === MotionStatus.VotingActive,
);
const isComplete = computed(
	() => motion.value?.status === MotionStatus.VotingComplete,
);

const participationPercentage = computed(() => {
	const totalVotes = motion.value?.totalVotesCast;
	const eligibleCount = motion.value?.eligibleVoterCount;
	if (
		totalVotes === null ||
		totalVotes === undefined ||
		eligibleCount === null ||
		eligibleCount === undefined ||
		eligibleCount === ZERO_DIVISOR
	) {
		return null;
	}
	return ((totalVotes / eligibleCount) * PERCENTAGE_MULTIPLIER).toFixed(
		PERCENTAGE_PRECISION,
	);
});

async function loadMotion(): Promise<void> {
	const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(motionId)) {
		error.value = "Invalid motion ID";
		return;
	}

	loading.value = true;
	error.value = null;

	try {
		const response = await getWatcherMotionDetail(motionId);
		if (response.success && response.data !== undefined) {
			motion.value = response.data;
		} else {
			error.value = response.error ?? "Failed to load motion";
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load motion";
	} finally {
		loading.value = false;
	}
}

async function loadVoters(): Promise<void> {
	if (loadingVoters.value || motion.value === null) return;

	const motionId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(motionId)) return;

	loadingVoters.value = true;
	try {
		const response = await getWatcherMotionVoters(motionId);
		if (response.success && response.data !== undefined) {
			voters.value = response.data;
		}
	} catch {
		// Silently fail - voter loading is not critical
	} finally {
		loadingVoters.value = false;
	}
}

function toggleVoters(): void {
	showVoters.value = !showVoters.value;
	if (showVoters.value && voters.value.length === EMPTY_ARRAY_LENGTH) {
		void loadVoters();
	}
}

function formatDate(date: Date | string | null): string {
	if (date === null) return "-";
	return new Date(date).toLocaleString();
}

function getStatusLabel(status: MotionStatus): string {
	switch (status) {
		case MotionStatus.NotYetStarted:
			return "Not Yet Started";
		case MotionStatus.VotingActive:
			return "Voting Active";
		case MotionStatus.VotingComplete:
			return "Voting Complete";
	}
}

function getStatusClass(status: MotionStatus): string {
	switch (status) {
		case MotionStatus.NotYetStarted:
			return "not-started";
		case MotionStatus.VotingActive:
			return "active";
		case MotionStatus.VotingComplete:
			return "complete";
	}
}

function goBack(): void {
	if (motion.value === null) {
		void router.push("/watcher/meetings");
	} else {
		void router.push(`/watcher/meetings/${motion.value.meetingId}`);
	}
}

onMounted(() => {
	void loadMotion();
});
</script>

<template>
	<div class="motion-report">
		<div class="header">
			<h2>Motion Report</h2>
			<button class="btn btn-secondary" @click="goBack">Back to Meeting</button>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading motion...</div>

		<template v-else-if="motion !== null">
			<!-- Motion Header -->
			<div class="motion-header">
				<div class="motion-title">
					<h3>{{ motion.motionName }}</h3>
					<span class="status-badge" :class="getStatusClass(motion.status)">
						{{ getStatusLabel(motion.status) }}
					</span>
				</div>
				<p v-if="motion.description" class="description">
					{{ motion.description }}
				</p>
				<p class="meeting-link">
					Meeting: <strong>{{ motion.meetingName }}</strong>
				</p>
			</div>

			<!-- Motion Details -->
			<div class="motion-details">
				<h4>Details</h4>
				<div class="details-grid">
					<div class="detail-item">
						<span class="detail-label">Voting Pool</span>
						<span class="detail-value">{{
							motion.votingPoolName ?? "No pool assigned"
						}}</span>
					</div>
					<div class="detail-item">
						<span class="detail-label">Selections</span>
						<span class="detail-value">{{ motion.seatCount }}</span>
					</div>
					<div class="detail-item">
						<span class="detail-label">Planned Duration</span>
						<span class="detail-value"
							>{{ motion.plannedDuration }} minutes</span
						>
					</div>
					<div v-if="motion.eligibleVoterCount !== null" class="detail-item">
						<span class="detail-label">Eligible Voters</span>
						<span class="detail-value">{{ motion.eligibleVoterCount }}</span>
					</div>
				</div>
			</div>

			<!-- Not Yet Started State -->
			<div v-if="isNotStarted" class="status-section not-started">
				<div class="status-icon">
					<span class="icon-pending">...</span>
				</div>
				<h4>Voting Has Not Started</h4>
				<p>This motion is scheduled but voting has not begun yet.</p>
			</div>

			<!-- Voting Active State -->
			<div v-if="isActive" class="status-section active">
				<div class="status-icon">
					<span class="icon-active">Live</span>
				</div>
				<h4>Voting In Progress</h4>
				<div class="active-stats">
					<div class="stat-card">
						<div class="stat-value">{{ motion.totalVotesCast ?? 0 }}</div>
						<div class="stat-label">Votes Cast</div>
					</div>
					<div v-if="motion.eligibleVoterCount !== null" class="stat-card">
						<div class="stat-value">{{ motion.eligibleVoterCount }}</div>
						<div class="stat-label">Eligible Voters</div>
					</div>
					<div v-if="participationPercentage !== null" class="stat-card">
						<div class="stat-value">{{ participationPercentage }}%</div>
						<div class="stat-label">Participation</div>
					</div>
				</div>
				<div class="time-info">
					<p>
						<strong>Started:</strong> {{ formatDate(motion.votingStartedAt) }}
					</p>
					<p v-if="motion.endOverride !== null">
						<strong>Ends:</strong> {{ formatDate(motion.endOverride) }}
					</p>
				</div>
				<p class="privacy-note">
					Vote content is not visible while voting is active.
				</p>
			</div>

			<!-- Voting Complete State -->
			<div v-if="isComplete" class="status-section complete">
				<h4>Final Results</h4>

				<!-- Summary Stats -->
				<div class="results-stats">
					<div class="stat-card">
						<div class="stat-value">{{ motion.totalVotesCast }}</div>
						<div class="stat-label">Total Ballots Cast</div>
					</div>
					<div v-if="motion.eligibleVoterCount !== null" class="stat-card">
						<div class="stat-value">{{ motion.eligibleVoterCount }}</div>
						<div class="stat-label">Eligible Voters</div>
					</div>
					<div
						v-if="participationPercentage !== null"
						class="stat-card highlight"
					>
						<div class="stat-value">{{ participationPercentage }}%</div>
						<div class="stat-label">Participation Rate</div>
					</div>
					<div v-if="motion.totalAbstentions !== null" class="stat-card">
						<div class="stat-value">{{ motion.totalAbstentions }}</div>
						<div class="stat-label">Abstentions</div>
					</div>
				</div>

				<!-- Choice Results -->
				<div v-if="motion.result !== null" class="choice-results">
					<h5>Vote Tallies</h5>
					<div class="results-table">
						<div
							v-for="choice in motion.result.choiceTallies"
							:key="choice.choiceId"
							class="result-row"
							:class="{ winner: choice.isWinner }"
						>
							<div class="choice-info">
								<span class="choice-name">{{ choice.choiceName }}</span>
								<span v-if="choice.isWinner" class="winner-badge">Winner</span>
							</div>
							<div class="vote-count">{{ choice.voteCount }} votes</div>
						</div>
					</div>
				</div>

				<!-- Time Info -->
				<div class="time-info">
					<p>
						<strong>Started:</strong> {{ formatDate(motion.votingStartedAt) }}
					</p>
					<p><strong>Ended:</strong> {{ formatDate(motion.votingEndedAt) }}</p>
				</div>

				<!-- Voters Section -->
				<div class="voters-section">
					<button class="btn btn-secondary" @click="toggleVoters">
						{{ showVoters ? "Hide Voter List" : "Show Voter List" }}
					</button>

					<div v-if="showVoters" class="voters-list">
						<div v-if="loadingVoters" class="loading-small">
							Loading voters...
						</div>
						<template v-else-if="voters.length > 0">
							<table class="voters-table">
								<thead>
									<tr>
										<th>Name</th>
										<th>Voted At</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="(voter, index) in voters" :key="index">
										<td>{{ voter.firstName }} {{ voter.lastName }}</td>
										<td>{{ formatDate(voter.votedAt) }}</td>
									</tr>
								</tbody>
							</table>
							<p class="privacy-note">
								This list shows who voted, not what they voted for.
							</p>
						</template>
						<div v-else class="no-voters">No voters found.</div>
					</div>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped>
.motion-report {
	max-width: 900px;
	margin: 0 auto;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: center;
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

.loading {
	text-align: center;
	padding: 2rem;
	color: #666;
}

.motion-header {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	margin-bottom: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.motion-title {
	display: flex;
	align-items: center;
	gap: 1rem;
	margin-bottom: 0.5rem;
}

.motion-title h3 {
	margin: 0;
	color: #2c3e50;
}

.description {
	color: #666;
	margin: 0.5rem 0;
}

.meeting-link {
	margin: 0.5rem 0 0 0;
	font-size: 0.875rem;
	color: #666;
}

.status-badge {
	display: inline-block;
	padding: 0.375rem 0.75rem;
	border-radius: 20px;
	font-weight: 600;
	font-size: 0.75rem;
}

.status-badge.not-started {
	background: #e0e0e0;
	color: #616161;
}

.status-badge.active {
	background: #fff3e0;
	color: #ef6c00;
}

.status-badge.complete {
	background: #c8e6c9;
	color: #2e7d32;
}

.motion-details {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	margin-bottom: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.motion-details h4 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.details-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 1rem;
}

.detail-item {
	display: flex;
	flex-direction: column;
}

.detail-label {
	font-size: 0.75rem;
	color: #666;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.detail-value {
	font-size: 1rem;
	color: #2c3e50;
	font-weight: 500;
}

.status-section {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	margin-bottom: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.status-section h4 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.status-section.not-started {
	text-align: center;
	color: #666;
}

.status-icon {
	margin-bottom: 1rem;
}

.icon-pending {
	font-size: 2rem;
	color: #bdbdbd;
}

.icon-active {
	display: inline-block;
	background: #fff3e0;
	color: #ef6c00;
	padding: 0.5rem 1rem;
	border-radius: 20px;
	font-weight: 600;
	font-size: 0.875rem;
	animation: pulse 2s infinite;
}

@keyframes pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.6;
	}
}

.active-stats,
.results-stats {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	gap: 1rem;
	margin-bottom: 1.5rem;
}

.stat-card {
	background: #f5f5f5;
	border-radius: 8px;
	padding: 1rem;
	text-align: center;
}

.stat-card.highlight {
	background: #e3f2fd;
	border: 2px solid #1976d2;
}

.stat-value {
	font-size: 1.75rem;
	font-weight: bold;
	color: #2c3e50;
}

.stat-card.highlight .stat-value {
	color: #1976d2;
}

.stat-label {
	font-size: 0.75rem;
	color: #666;
	text-transform: uppercase;
	margin-top: 0.25rem;
}

.time-info {
	margin: 1rem 0;
}

.time-info p {
	margin: 0.25rem 0;
	font-size: 0.875rem;
	color: #666;
}

.privacy-note {
	font-size: 0.75rem;
	color: #999;
	font-style: italic;
	margin: 1rem 0 0 0;
}

.choice-results {
	margin-bottom: 1.5rem;
}

.choice-results h5 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.results-table {
	border: 1px solid #e0e0e0;
	border-radius: 8px;
	overflow: hidden;
}

.result-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.75rem 1rem;
	border-bottom: 1px solid #e0e0e0;
}

.result-row:last-child {
	border-bottom: none;
}

.result-row.winner {
	background: #e8f5e9;
}

.choice-info {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.choice-name {
	font-weight: 500;
	color: #2c3e50;
}

.winner-badge {
	display: inline-block;
	background: #c8e6c9;
	color: #2e7d32;
	padding: 0.125rem 0.5rem;
	border-radius: 10px;
	font-size: 0.625rem;
	font-weight: 600;
	text-transform: uppercase;
}

.vote-count {
	font-size: 0.875rem;
	color: #666;
}

.result-row.winner .vote-count {
	color: #2e7d32;
	font-weight: 600;
}

.voters-section {
	margin-top: 1.5rem;
	padding-top: 1.5rem;
	border-top: 1px solid #e0e0e0;
}

.voters-list {
	margin-top: 1rem;
}

.loading-small {
	text-align: center;
	padding: 1rem;
	color: #666;
}

.voters-table {
	width: 100%;
	border-collapse: collapse;
}

.voters-table th,
.voters-table td {
	padding: 0.5rem;
	text-align: left;
	border-bottom: 1px solid #e0e0e0;
}

.voters-table th {
	font-weight: 600;
	color: #2c3e50;
	background: #f5f5f5;
}

.no-voters {
	text-align: center;
	padding: 1rem;
	color: #666;
}

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.875rem;
	font-weight: 500;
	transition: all 0.2s;
}

.btn-secondary {
	background-color: #757575;
	color: white;
}

.btn-secondary:hover {
	background-color: #616161;
}
</style>
