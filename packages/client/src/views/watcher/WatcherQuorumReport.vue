<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import {
	getWatcherQuorumReport,
	getWatcherQuorumVoters,
} from "../../services/api";
import type {
	QuorumReport,
	QuorumActiveVoter,
} from "@mcdc-convention-voting/shared";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();

// Constants
const DECIMAL_RADIX = 10;
const PERCENTAGE_PRECISION = 1;
const REFRESH_INTERVAL_MS = 30000;
const EMPTY_ARRAY_LENGTH = 0;

const report = ref<QuorumReport | null>(null);
const voters = ref<QuorumActiveVoter[]>([]);
const loading = ref(false);
const loadingVoters = ref(false);
const error = ref<string | null>(null);
const showVoters = ref(false);

// Interval for auto-refresh
let refreshInterval: ReturnType<typeof setInterval> | null = null;

const isQuorumCalled = computed(() => report.value?.quorumCalledAt !== null);

const formattedPercentage = computed(() => {
	if (report.value === null) return "0.0";
	return report.value.activeVoterPercentage.toFixed(PERCENTAGE_PRECISION);
});

const formattedQuorumTime = computed(() => {
	if (report.value?.quorumCalledAt === null) return null;
	return new Date(report.value.quorumCalledAt).toLocaleString();
});

async function loadReport(): Promise<void> {
	const meetingId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(meetingId)) {
		error.value = "Invalid meeting ID";
		return;
	}

	try {
		const response = await getWatcherQuorumReport(meetingId);
		if (response.success && response.data !== undefined) {
			report.value = response.data;
		} else {
			error.value = response.error ?? "Failed to load quorum report";
		}
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to load quorum report";
	}
}

async function loadVoters(): Promise<void> {
	if (loadingVoters.value) return;

	const meetingId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(meetingId)) return;

	loadingVoters.value = true;
	try {
		const response = await getWatcherQuorumVoters(meetingId);
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

function startAutoRefresh(): void {
	if (refreshInterval !== null) return;
	refreshInterval = setInterval(() => {
		void loadReport();
		if (showVoters.value) {
			void loadVoters();
		}
	}, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh(): void {
	if (refreshInterval !== null) {
		clearInterval(refreshInterval);
		refreshInterval = null;
	}
}

function goBack(): void {
	void router.push("/watcher/meetings");
}

onMounted(async () => {
	loading.value = true;
	await loadReport();
	loading.value = false;

	// Start auto-refresh if quorum is not called
	if (report.value !== null && !isQuorumCalled.value) {
		startAutoRefresh();
	}
});

onUnmounted(() => {
	stopAutoRefresh();
});
</script>

<template>
	<div class="meeting-quorum">
		<div class="header">
			<h2>Quorum Report (Read-Only)</h2>
			<button class="btn btn-secondary" @click="goBack">
				Back to Meetings
			</button>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading quorum report...</div>

		<template v-else-if="report !== null">
			<div class="meeting-info">
				<h3>{{ report.meetingName }}</h3>
				<p class="pool-info">Quorum Pool: {{ report.quorumPoolName }}</p>
			</div>

			<div class="quorum-stats">
				<div class="stat-card">
					<div class="stat-value">{{ report.totalEligibleVoters }}</div>
					<div class="stat-label">Eligible Voters</div>
				</div>

				<div class="stat-card active">
					<div class="stat-value">{{ report.activeVoterCount }}</div>
					<div class="stat-label">Active Voters</div>
				</div>

				<div class="stat-card percentage">
					<div class="stat-value">{{ formattedPercentage }}%</div>
					<div class="stat-label">Participation</div>
				</div>
			</div>

			<div class="quorum-status">
				<div v-if="isQuorumCalled" class="status-called">
					<span class="status-badge called">Quorum Called</span>
					<p class="status-time">Called at: {{ formattedQuorumTime }}</p>
					<p class="status-note">
						Active voter count is frozen as of the time quorum was called.
					</p>
				</div>
				<div v-else class="status-live">
					<span class="status-badge live">Live Counting</span>
					<p class="status-note">
						Active voter count updates every 30 seconds.
					</p>
				</div>
			</div>

			<div class="read-only-notice">
				<p>
					This is a read-only view. Only administrators can call or uncall
					quorum.
				</p>
			</div>

			<div class="voters-section">
				<button class="btn btn-secondary" @click="toggleVoters">
					{{ showVoters ? "Hide Active Voters" : "Show Active Voters" }}
				</button>

				<div v-if="showVoters" class="voters-list">
					<div v-if="loadingVoters" class="loading-voters">
						Loading voters...
					</div>
					<template v-else-if="voters.length > 0">
						<table class="voters-table">
							<thead>
								<tr>
									<th>Name</th>
									<th>Username</th>
									<th>Last Activity</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="voter in voters" :key="voter.userId">
									<td>{{ voter.firstName }} {{ voter.lastName }}</td>
									<td>{{ voter.username }}</td>
									<td>{{ new Date(voter.lastActivity).toLocaleString() }}</td>
								</tr>
							</tbody>
						</table>
					</template>
					<div v-else class="no-voters">No active voters found.</div>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped>
.meeting-quorum {
	max-width: 800px;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1.5rem;
}

h2 {
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

.meeting-info {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	margin-bottom: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.meeting-info h3 {
	margin: 0 0 0.5rem 0;
	color: #2c3e50;
}

.pool-info {
	margin: 0;
	color: #666;
}

.quorum-stats {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 1rem;
	margin-bottom: 1.5rem;
}

.stat-card {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	text-align: center;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.stat-card.active {
	background: #e3f2fd;
	border: 2px solid #1976d2;
}

.stat-card.percentage {
	background: #f3e5f5;
	border: 2px solid #7b1fa2;
}

.stat-value {
	font-size: 2.5rem;
	font-weight: bold;
	color: #2c3e50;
}

.stat-card.active .stat-value {
	color: #1976d2;
}

.stat-card.percentage .stat-value {
	color: #7b1fa2;
}

.stat-label {
	font-size: 0.875rem;
	color: #666;
	margin-top: 0.5rem;
}

.quorum-status {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	margin-bottom: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.status-badge {
	display: inline-block;
	padding: 0.5rem 1rem;
	border-radius: 20px;
	font-weight: 600;
	font-size: 0.875rem;
}

.status-badge.called {
	background: #c8e6c9;
	color: #2e7d32;
}

.status-badge.live {
	background: #fff3e0;
	color: #ef6c00;
}

.status-time {
	margin: 0.75rem 0 0 0;
	color: #2c3e50;
}

.status-note {
	margin: 0.5rem 0 0 0;
	color: #666;
	font-size: 0.875rem;
}

.read-only-notice {
	background: #fff8e1;
	border: 1px solid #ffc107;
	border-radius: 8px;
	padding: 1rem;
	margin-bottom: 1.5rem;
}

.read-only-notice p {
	margin: 0;
	color: #856404;
	font-size: 0.875rem;
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

.btn-secondary {
	background-color: #757575;
	color: white;
}

.btn-secondary:hover:not(:disabled) {
	background-color: #616161;
}

.voters-section {
	margin-top: 1.5rem;
}

.voters-list {
	margin-top: 1rem;
	background: white;
	border-radius: 8px;
	padding: 1rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.loading-voters,
.no-voters {
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
	padding: 0.75rem;
	text-align: left;
	border-bottom: 1px solid #e0e0e0;
}

.voters-table th {
	font-weight: 600;
	color: #2c3e50;
	background: #f5f5f5;
}

.voters-table tbody tr:hover {
	background: #f5f5f5;
}
</style>
