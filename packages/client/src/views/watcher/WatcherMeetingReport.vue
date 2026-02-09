<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { MotionStatus } from "@mcdc-convention-voting/shared";
import { getWatcherMeetingReport } from "../../services/api";
import type { WatcherMeetingReport } from "@mcdc-convention-voting/shared";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();

const DECIMAL_RADIX = 10;

const report = ref<WatcherMeetingReport | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function loadReport(): Promise<void> {
	const meetingId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(meetingId)) {
		error.value = "Invalid meeting ID";
		return;
	}

	loading.value = true;
	error.value = null;

	try {
		const response = await getWatcherMeetingReport(meetingId);
		if (response.success && response.data !== undefined) {
			report.value = response.data;
		} else {
			error.value = response.error ?? "Failed to load meeting report";
		}
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to load meeting report";
	} finally {
		loading.value = false;
	}
}

function formatDate(date: Date | string | null): string {
	if (date === null) return "—";
	return new Date(date).toLocaleString();
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
			return "not-started";
		case MotionStatus.VotingActive:
			return "active";
		case MotionStatus.VotingComplete:
			return "complete";
	}
}

function goBack(): void {
	void router.push("/watcher/meetings");
}

onMounted(() => {
	void loadReport();
});
</script>

<template>
	<div class="meeting-report">
		<div class="header">
			<h2>Meeting Report</h2>
			<button class="btn btn-secondary" @click="goBack">
				Back to Meetings
			</button>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading meeting report...</div>

		<template v-else-if="report !== null">
			<div class="meeting-info">
				<h3>{{ report.meetingName }}</h3>
				<p v-if="report.description" class="description">
					{{ report.description }}
				</p>
				<div class="info-grid">
					<div class="info-item">
						<span class="info-label">Start:</span>
						<span class="info-value">{{ formatDate(report.startDate) }}</span>
					</div>
					<div class="info-item">
						<span class="info-label">End:</span>
						<span class="info-value">{{ formatDate(report.endDate) }}</span>
					</div>
					<div class="info-item">
						<span class="info-label">Quorum Pool:</span>
						<span class="info-value">{{ report.quorumPoolName }}</span>
					</div>
					<div class="info-item">
						<span class="info-label">Quorum Called:</span>
						<span class="info-value">{{
							report.quorumCalledAt !== null
								? formatDate(report.quorumCalledAt)
								: "Not called"
						}}</span>
					</div>
				</div>
			</div>

			<div class="motions-section">
				<h3>Motions ({{ report.motionSummaries.length }})</h3>

				<div v-if="report.motionSummaries.length === 0" class="empty">
					No motions for this meeting.
				</div>

				<div v-else class="table-container">
					<table class="motions-table">
						<thead>
							<tr>
								<th>Motion</th>
								<th>Status</th>
								<th>Voting Pool</th>
								<th>Votes Cast</th>
								<th>Abstentions</th>
								<th>Started</th>
								<th>Ended</th>
								<th>Results</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="motion in report.motionSummaries"
								:key="motion.motionId"
							>
								<td class="motion-name">{{ motion.motionName }}</td>
								<td>
									<span
										class="status-badge"
										:class="getStatusClass(motion.status)"
									>
										{{ getStatusLabel(motion.status) }}
									</span>
								</td>
								<td>{{ motion.votingPoolName || "—" }}</td>
								<td>{{ motion.totalVotesCast }}</td>
								<td>
									{{
										motion.status === MotionStatus.VotingComplete
											? motion.totalAbstentions
											: ""
									}}
								</td>
								<td>{{ formatDate(motion.votingStartedAt) }}</td>
								<td>{{ formatDate(motion.votingEndedAt) }}</td>
								<td class="results-cell">
									<template
										v-if="
											motion.status === MotionStatus.VotingComplete &&
											motion.result !== null
										"
									>
										<div class="results-summary">
											<div
												v-for="choice in motion.result.choiceTallies"
												:key="choice.choiceId"
												class="choice-result"
												:class="{ winner: choice.isWinner }"
											>
												{{ choice.choiceName }}: {{ choice.voteCount }}
												<span v-if="choice.isWinner" class="winner-badge"
													>Winner</span
												>
											</div>
										</div>
									</template>
									<span v-else class="no-results">—</span>
								</td>
								<td>
									<router-link
										:to="`/watcher/motions/${motion.motionId}`"
										class="btn btn-small btn-link"
									>
										View Report
									</router-link>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped>
.meeting-report {
	max-width: 1400px;
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

.meeting-info .description {
	color: #666;
	margin: 0 0 1rem 0;
}

.info-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: 1rem;
}

.info-item {
	display: flex;
	flex-direction: column;
}

.info-label {
	font-size: 0.75rem;
	color: #666;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.info-value {
	font-size: 0.875rem;
	color: #2c3e50;
}

.motions-section {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.motions-section h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.empty {
	text-align: center;
	padding: 2rem;
	color: #666;
}

.table-container {
	overflow-x: auto;
}

.motions-table {
	width: 100%;
	border-collapse: collapse;
}

.motions-table th {
	background-color: #f8f9fa;
	padding: 0.75rem;
	text-align: left;
	font-weight: 600;
	color: #2c3e50;
	border-bottom: 2px solid #dee2e6;
	font-size: 0.875rem;
}

.motions-table td {
	padding: 0.75rem;
	border-bottom: 1px solid #dee2e6;
	font-size: 0.875rem;
}

.motions-table tbody tr:hover {
	background-color: #f8f9fa;
}

.motion-name {
	font-weight: 500;
	color: #2c3e50;
}

.status-badge {
	display: inline-block;
	padding: 0.25rem 0.5rem;
	border-radius: 20px;
	font-weight: 500;
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

.results-cell {
	min-width: 200px;
}

.results-summary {
	margin-bottom: 0.5rem;
}

.choice-result {
	font-size: 0.8125rem;
	padding: 0.125rem 0;
}

.choice-result.winner {
	font-weight: 600;
	color: #2e7d32;
}

.winner-badge {
	display: inline-block;
	background: #c8e6c9;
	color: #2e7d32;
	padding: 0.125rem 0.375rem;
	border-radius: 10px;
	font-size: 0.625rem;
	margin-left: 0.25rem;
	text-transform: uppercase;
}

.no-results {
	color: #999;
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

.btn-secondary {
	background-color: #757575;
	color: white;
}

.btn-secondary:hover {
	background-color: #616161;
}

.btn-small {
	padding: 0.25rem 0.5rem;
	font-size: 0.75rem;
}

.btn-link {
	background: none;
	color: #34495e;
	text-decoration: underline;
	padding: 0;
}

.btn-link:hover {
	color: #2c3e50;
}
</style>
