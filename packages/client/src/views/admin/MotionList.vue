<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { MotionStatus } from "@mcdc-convention-voting/shared";
import {
	getMotions,
	getMeeting,
	getMotionVoteStats,
	deleteMotion,
	updateMotionStatus,
} from "../../services/api";
import TablePagination from "../../components/TablePagination.vue";
import type {
	MotionVoteStats,
	MotionWithPool,
	MeetingWithPool,
} from "@mcdc-convention-voting/shared";

const props = defineProps<{
	meetingId: string;
}>();

const router = useRouter();

const MOTIONS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;
const DECIMAL_RADIX = 10;
const STATS_POLL_INTERVAL_MS = 30000; // 30 seconds

// Time constants
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const TIMER_UPDATE_INTERVAL_MS = 1000;
const ZERO = 0;
const URGENT_THRESHOLD_MINUTES = 5;

const meeting = ref<MeetingWithPool | null>(null);
const motions = ref<MotionWithPool[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalMotions = ref(INITIAL_TOTAL);

// Vote statistics
const voteStatsMap = ref<Map<number, MotionVoteStats>>(new Map());
let statsIntervalId: ReturnType<typeof setInterval> | null = null;

// Countdown timer
const now = ref(new Date());
let timerIntervalId: ReturnType<typeof setInterval> | null = null;

const totalPages = computed(() =>
	Math.ceil(totalMotions.value / MOTIONS_PER_PAGE),
);

// Modal state for delete
const showDeleteModal = ref(false);
const motionToDelete = ref<number | null>(null);

// Modal state for status change
const showStatusModal = ref(false);
const motionToChangeStatus = ref<number | null>(null);
const newStatus = ref<MotionStatus | null>(null);

async function loadMeeting(): Promise<void> {
	const meetingIdNum = Number.parseInt(props.meetingId, DECIMAL_RADIX);
	if (Number.isNaN(meetingIdNum)) {
		error.value = "Invalid meeting ID";
		return;
	}

	try {
		const response = await getMeeting(meetingIdNum);
		if (response.data !== undefined) {
			const { data } = response;
			meeting.value = data;
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load meeting";
	}
}

async function loadMotions(): Promise<void> {
	loading.value = true;
	error.value = null;

	const meetingIdNum = Number.parseInt(props.meetingId, DECIMAL_RADIX);
	if (Number.isNaN(meetingIdNum)) {
		error.value = "Invalid meeting ID";
		loading.value = false;
		return;
	}

	try {
		const response = await getMotions(
			meetingIdNum,
			currentPage.value,
			MOTIONS_PER_PAGE,
		);
		const { data, pagination } = response;
		motions.value = data;
		totalMotions.value = pagination.total;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load motions";
	} finally {
		loading.value = false;
	}
}

function editMotion(motionId: number): void {
	void router.push(`/admin/motions/${motionId}`);
}

function createMotion(): void {
	void router.push(`/admin/meetings/${props.meetingId}/motions/create`);
}

function getStatusLabel(status: MotionStatus): string {
	switch (status) {
		case MotionStatus.NotYetStarted:
			return "Not Started";
		case MotionStatus.VotingActive:
			return "Voting Active";
		case MotionStatus.VotingComplete:
			return "Complete";
	}
}

function getStatusClass(status: MotionStatus): string {
	switch (status) {
		case MotionStatus.NotYetStarted:
			return "status-not-started";
		case MotionStatus.VotingActive:
			return "status-voting-active";
		case MotionStatus.VotingComplete:
			return "status-complete";
	}
}

function canStartVoting(status: MotionStatus): boolean {
	return status === MotionStatus.NotYetStarted;
}

function canEndVoting(status: MotionStatus): boolean {
	return status === MotionStatus.VotingActive;
}

function requestStartVoting(motionId: number): void {
	motionToChangeStatus.value = motionId;
	newStatus.value = MotionStatus.VotingActive;
	showStatusModal.value = true;
}

function requestEndVoting(motionId: number): void {
	motionToChangeStatus.value = motionId;
	newStatus.value = MotionStatus.VotingComplete;
	showStatusModal.value = true;
}

function cancelStatusChange(): void {
	showStatusModal.value = false;
	motionToChangeStatus.value = null;
	newStatus.value = null;
}

async function handleStatusChange(): Promise<void> {
	if (motionToChangeStatus.value === null || newStatus.value === null) {
		return;
	}

	showStatusModal.value = false;
	const { value: motionId } = motionToChangeStatus;
	const { value: status } = newStatus;
	motionToChangeStatus.value = null;
	newStatus.value = null;

	try {
		await updateMotionStatus(motionId, { status });
		await loadMotions();
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to update motion status";
	}
}

function requestDelete(motionId: number): void {
	motionToDelete.value = motionId;
	showDeleteModal.value = true;
}

function cancelDelete(): void {
	showDeleteModal.value = false;
	motionToDelete.value = null;
}

async function handleDelete(): Promise<void> {
	if (motionToDelete.value === null) {
		return;
	}

	showDeleteModal.value = false;
	const { value: motionId } = motionToDelete;
	motionToDelete.value = null;

	try {
		await deleteMotion(motionId);
		await loadMotions();
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to delete motion";
	}
}

function goToPage(page: number): void {
	currentPage.value = page;
	void loadMotions();
}

function goBack(): void {
	void router.push("/admin/meetings");
}

/**
 * Calculate when voting ends for a motion
 */
function getVotingEndsAt(motion: MotionWithPool): Date | null {
	if (motion.status !== MotionStatus.VotingActive) {
		return null;
	}

	if (motion.endOverride !== null) {
		return new Date(motion.endOverride);
	}

	// Calculate from votingStartedAt + plannedDuration
	if (motion.votingStartedAt === null) {
		return null;
	}
	const startTime = new Date(motion.votingStartedAt);
	const durationMs =
		motion.plannedDuration * SECONDS_PER_MINUTE * MS_PER_SECOND;
	return new Date(startTime.getTime() + durationMs);
}

/**
 * Format milliseconds as human-readable duration string
 */
function formatDuration(ms: number): string {
	const totalSeconds = Math.floor(ms / MS_PER_SECOND);
	const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
	const seconds = totalSeconds % SECONDS_PER_MINUTE;

	if (minutes >= MINUTES_PER_HOUR) {
		const hours = Math.floor(minutes / MINUTES_PER_HOUR);
		const remainingMinutes = minutes % MINUTES_PER_HOUR;
		return `${String(hours)}h ${String(remainingMinutes)}m`;
	}

	return `${String(minutes)}m ${String(seconds)}s`;
}

/**
 * Get remaining time for a motion in milliseconds (clamped to 0)
 */
function getRemainingMs(motion: MotionWithPool): number {
	const endsAt = getVotingEndsAt(motion);
	if (endsAt === null) {
		return ZERO;
	}

	const remaining = endsAt.getTime() - now.value.getTime();
	return remaining > ZERO ? remaining : ZERO;
}

/**
 * Format remaining time as human-readable string (shows overtime when exceeded)
 */
function formatRemainingTime(motion: MotionWithPool): string {
	const endsAt = getVotingEndsAt(motion);
	if (endsAt === null) {
		return "";
	}

	const diff = endsAt.getTime() - now.value.getTime();

	if (diff <= ZERO) {
		const overtime = Math.abs(diff);
		return `Over by ${formatDuration(overtime)}`;
	}

	return formatDuration(diff);
}

/**
 * Check if time is running out (less than 5 minutes)
 */
function isTimeUrgent(motion: MotionWithPool): boolean {
	const remainingMs = getRemainingMs(motion);
	const urgentThresholdMs =
		URGENT_THRESHOLD_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
	return remainingMs > ZERO && remainingMs < urgentThresholdMs;
}

/**
 * Check if planned duration has been exceeded
 */
function isOvertime(motion: MotionWithPool): boolean {
	const endsAt = getVotingEndsAt(motion);
	if (endsAt === null) {
		return false;
	}
	return endsAt.getTime() < now.value.getTime();
}

/**
 * Load vote statistics for all voting_active and voting_complete motions
 */
async function loadVoteStats(): Promise<void> {
	const motionsWithStats = motions.value.filter(
		(m) =>
			m.status === MotionStatus.VotingActive ||
			m.status === MotionStatus.VotingComplete,
	);

	// Load all vote stats in parallel
	await Promise.all(
		motionsWithStats.map(async (motion) => {
			try {
				const response = await getMotionVoteStats(motion.id);
				if (response.data !== undefined) {
					voteStatsMap.value.set(motion.id, response.data);
				}
			} catch (err) {
				// Silently fail for individual stats - don't break the whole page
				// eslint-disable-next-line no-console -- Error logging for debugging
				console.error(`Failed to load stats for motion ${motion.id}:`, err);
			}
		}),
	);
}

/**
 * Start polling for vote stats
 */
function startStatsPolling(): void {
	void loadVoteStats(); // Initial load
	statsIntervalId = setInterval(() => {
		void loadVoteStats();
	}, STATS_POLL_INTERVAL_MS);
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

onMounted(() => {
	void loadMeeting();
	void loadMotions().then(() => {
		startStatsPolling();
	});

	// Start countdown timer
	timerIntervalId = setInterval(() => {
		now.value = new Date();
	}, TIMER_UPDATE_INTERVAL_MS);
});

onUnmounted(() => {
	stopStatsPolling();

	// Stop countdown timer
	if (timerIntervalId !== null) {
		clearInterval(timerIntervalId);
		timerIntervalId = null;
	}
});

// Restart polling when page changes
watch(currentPage, () => {
	stopStatsPolling();
	void loadMotions().then(() => {
		startStatsPolling();
	});
});
</script>

<template>
	<div class="motion-list">
		<div class="header">
			<div class="header-left">
				<button class="btn btn-secondary btn-small" @click="goBack">
					&larr; Back to Meetings
				</button>
				<h2 v-if="meeting">Motions for: {{ meeting.name }}</h2>
				<h2 v-else>Motions</h2>
			</div>
			<div class="actions">
				<button class="btn btn-primary" @click="createMotion">
					Create Motion
				</button>
			</div>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading motions...</div>

		<div v-else-if="motions.length === 0" class="empty">
			No motions found. Create a motion to get started.
		</div>

		<div v-else class="table-container">
			<table class="motions-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Description</th>
						<th>Duration</th>
						<th>Seats</th>
						<th>Pool</th>
						<th>Status</th>
						<th>Votes</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="motion in motions" :key="motion.id">
						<td class="motion-name">
							<a
								href="#"
								class="motion-link"
								@click.prevent="editMotion(motion.id)"
							>
								{{ motion.name }}
							</a>
						</td>
						<td class="description">
							{{ motion.description || "—" }}
						</td>
						<td>{{ motion.plannedDuration }} min</td>
						<td>{{ motion.seatCount }}</td>
						<td>{{ motion.votingPoolName || "—" }}</td>
						<td>
							<span class="status-badge" :class="getStatusClass(motion.status)">
								{{ getStatusLabel(motion.status) }}
							</span>
						</td>
						<td class="votes-cell">
							<div
								v-if="motion.status === MotionStatus.VotingActive"
								class="voting-active-info"
							>
								<div v-if="voteStatsMap.has(motion.id)" class="vote-count-row">
									<span class="vote-count">
										{{ voteStatsMap.get(motion.id)!.totalVotes }} /
										{{ voteStatsMap.get(motion.id)!.eligibleVoters }}
									</span>
									<span class="participation-rate">
										({{
											voteStatsMap.get(motion.id)!.participationRate.toFixed(1)
										}}%)
									</span>
								</div>
								<div class="time-remaining-row">
									<span
										class="time-remaining"
										:class="{
											urgent: isTimeUrgent(motion),
											overtime: isOvertime(motion),
										}"
									>
										{{ formatRemainingTime(motion) }}
									</span>
								</div>
							</div>
							<div
								v-else-if="
									motion.status === MotionStatus.VotingComplete &&
									voteStatsMap.has(motion.id)
								"
								class="vote-count-row"
							>
								<span class="vote-count">
									{{ voteStatsMap.get(motion.id)!.totalVotes }} /
									{{ voteStatsMap.get(motion.id)!.eligibleVoters }}
								</span>
								<span class="participation-rate">
									({{
										voteStatsMap.get(motion.id)!.participationRate.toFixed(1)
									}}%)
								</span>
							</div>
							<span v-else class="vote-count-placeholder">—</span>
						</td>
						<td>
							<div class="actions-cell">
								<button
									v-if="canStartVoting(motion.status)"
									class="btn btn-small"
									@click="editMotion(motion.id)"
								>
									Edit
								</button>
								<button
									v-if="canStartVoting(motion.status)"
									class="btn btn-small btn-success"
									@click="requestStartVoting(motion.id)"
								>
									Start Voting
								</button>
								<button
									v-if="canEndVoting(motion.status)"
									class="btn btn-small btn-warning"
									@click="requestEndVoting(motion.id)"
								>
									End Voting
								</button>
								<button
									v-if="motion.status === MotionStatus.VotingComplete"
									class="btn btn-small btn-info"
									@click="editMotion(motion.id)"
								>
									View Results
								</button>
								<button
									v-if="canStartVoting(motion.status)"
									class="btn btn-small btn-danger"
									@click="requestDelete(motion.id)"
								>
									Delete
								</button>
							</div>
						</td>
					</tr>
				</tbody>
			</table>

			<TablePagination
				:current-page="currentPage"
				:total-pages="totalPages"
				:total-items="totalMotions"
				@page-change="goToPage"
			/>
		</div>

		<!-- Delete Confirmation Modal -->
		<div v-if="showDeleteModal" class="modal" @click="cancelDelete">
			<div class="modal-content" @click.stop>
				<h3>Confirm Delete Motion</h3>
				<p>
					Are you sure you want to delete this motion? This will also delete all
					choices associated with it. This action cannot be undone.
				</p>
				<div class="modal-actions">
					<button class="btn btn-danger" @click="handleDelete">
						Yes, Delete Motion
					</button>
					<button class="btn btn-secondary" @click="cancelDelete">
						Cancel
					</button>
				</div>
			</div>
		</div>

		<!-- Status Change Confirmation Modal -->
		<div v-if="showStatusModal" class="modal" @click="cancelStatusChange">
			<div class="modal-content" @click.stop>
				<h3 v-if="newStatus === MotionStatus.VotingActive">
					Confirm Start Voting
				</h3>
				<h3 v-else>Confirm End Voting</h3>
				<p v-if="newStatus === MotionStatus.VotingActive">
					Are you sure you want to start voting on this motion? Once voting
					starts, you will not be able to edit choices.
				</p>
				<p v-else>
					Are you sure you want to end voting on this motion? This action cannot
					be undone.
				</p>
				<div class="modal-actions">
					<button
						v-if="newStatus === MotionStatus.VotingActive"
						class="btn btn-success"
						@click="handleStatusChange"
					>
						Yes, Start Voting
					</button>
					<button v-else class="btn btn-warning" @click="handleStatusChange">
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
.motion-list {
	max-width: 1400px;
	margin: 0 auto;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 2rem;
}

.header-left {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.header h2 {
	margin: 0;
	color: #2c3e50;
}

.actions {
	display: flex;
	gap: 1rem;
}

.error {
	background-color: #fee;
	color: #c33;
	padding: 1rem;
	border-radius: 4px;
	margin-bottom: 1rem;
}

.loading {
	text-align: center;
	padding: 2rem;
	color: #666;
}

.empty {
	text-align: center;
	padding: 3rem;
	color: #666;
	background-color: white;
	border-radius: 8px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.table-container {
	background-color: white;
	border-radius: 8px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	overflow: hidden;
}

.motions-table {
	width: 100%;
	border-collapse: collapse;
}

.motions-table th {
	background-color: #f8f9fa;
	padding: 1rem;
	text-align: left;
	font-weight: 600;
	color: #2c3e50;
	border-bottom: 2px solid #dee2e6;
}

.motions-table td {
	padding: 1rem;
	border-bottom: 1px solid #dee2e6;
	vertical-align: middle;
}

.motions-table tbody tr:hover {
	background-color: #f8f9fa;
}

.motion-name {
	font-weight: 500;
	color: #2c3e50;
}

.description {
	max-width: 200px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.status-badge {
	display: inline-block;
	padding: 0.25rem 0.75rem;
	border-radius: 12px;
	font-size: 0.875rem;
	font-weight: 500;
}

.status-not-started {
	background-color: #e0e0e0;
	color: #616161;
}

.status-voting-active {
	background-color: #fff3e0;
	color: #e65100;
}

.status-complete {
	background-color: #e8f5e9;
	color: #2e7d32;
}

.actions-cell {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
	align-items: center;
}

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.875rem;
	font-weight: 500;
	text-decoration: none;
	display: inline-block;
	transition: all 0.2s;
}

.btn-primary {
	background-color: #007bff;
	color: white;
}

.btn-primary:hover {
	background-color: #0056b3;
}

.btn-secondary {
	background-color: #6c757d;
	color: white;
}

.btn-secondary:hover {
	background-color: #545b62;
}

.btn-small {
	padding: 0.25rem 0.75rem;
	font-size: 0.8125rem;
}

.btn-success {
	background-color: #28a745;
	color: white;
}

.btn-success:hover {
	background-color: #218838;
}

.btn-warning {
	background-color: #ffc107;
	color: #000;
}

.btn-warning:hover {
	background-color: #e0a800;
}

.btn-danger {
	background-color: #dc3545;
	color: white;
}

.btn-danger:hover {
	background-color: #c82333;
}

.btn-info {
	background-color: #17a2b8;
	color: white;
}

.btn-info:hover {
	background-color: #138496;
}

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.modal {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
}

.modal-content {
	background-color: white;
	padding: 2rem;
	border-radius: 8px;
	max-width: 500px;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal-content h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.modal-content p {
	margin: 0 0 1.5rem 0;
	color: #666;
	line-height: 1.5;
}

.modal-actions {
	display: flex;
	gap: 1rem;
	justify-content: flex-end;
}

/* Vote statistics styles */
.votes-cell {
	white-space: nowrap;
}

.voting-active-info {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.vote-count-row {
	display: flex;
	align-items: center;
}

.vote-count {
	font-weight: 600;
	color: #2c3e50;
}

.participation-rate {
	font-size: 0.875rem;
	color: #666;
	margin-left: 0.25rem;
}

.time-remaining-row {
	display: flex;
	align-items: center;
}

.time-remaining {
	font-size: 0.875rem;
	color: #2196f3;
	font-weight: 500;
}

.time-remaining.urgent {
	color: #f44336;
	font-weight: 600;
}

.time-remaining.overtime {
	color: #e65100;
	font-weight: 600;
}

.vote-count-placeholder {
	color: #999;
}

/* Motion name link */
.motion-link {
	color: #2c3e50;
	text-decoration: none;
	font-weight: 500;
	transition: color 0.2s;
}

.motion-link:hover {
	color: #007bff;
	text-decoration: underline;
	cursor: pointer;
}
</style>
