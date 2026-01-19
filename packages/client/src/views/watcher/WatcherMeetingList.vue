<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { getWatcherMeetings } from "../../services/api";
import type { WatcherMeetingReport } from "@mcdc-convention-voting/shared";

const router = useRouter();

const MEETINGS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;
const MIN_PAGE = 1;

const meetings = ref<WatcherMeetingReport[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalMeetings = ref(INITIAL_TOTAL);

const totalPages = computed(() =>
	Math.ceil(totalMeetings.value / MEETINGS_PER_PAGE),
);

async function loadMeetings(): Promise<void> {
	loading.value = true;
	error.value = null;

	try {
		const response = await getWatcherMeetings(
			currentPage.value,
			MEETINGS_PER_PAGE,
		);
		meetings.value = response.data;
		totalMeetings.value = response.total;
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to load meetings";
	} finally {
		loading.value = false;
	}
}

function viewMeeting(meetingId: number): void {
	void router.push(`/watcher/meetings/${meetingId}`);
}

function viewQuorum(meetingId: number): void {
	void router.push(`/watcher/meetings/${meetingId}/quorum`);
}

function formatDate(date: Date | string): string {
	return new Date(date).toLocaleString();
}

function goToPage(page: number): void {
	if (page >= MIN_PAGE && page <= totalPages.value) {
		currentPage.value = page;
		void loadMeetings();
	}
}

onMounted(() => {
	void loadMeetings();
});
</script>

<template>
	<div class="meeting-list">
		<div class="header">
			<h2>Meetings</h2>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading meetings...</div>

		<div v-else-if="meetings.length === 0" class="empty">
			No meetings found.
		</div>

		<div v-else class="table-container">
			<table class="meetings-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Description</th>
						<th>Start Date</th>
						<th>End Date</th>
						<th>Quorum Pool</th>
						<th>Quorum Status</th>
						<th>Motions</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="meeting in meetings" :key="meeting.meetingId">
						<td class="meeting-name">
							{{ meeting.meetingName }}
						</td>
						<td class="description">
							{{ meeting.description || "—" }}
						</td>
						<td>{{ formatDate(meeting.startDate) }}</td>
						<td>{{ formatDate(meeting.endDate) }}</td>
						<td>{{ meeting.quorumPoolName }}</td>
						<td>
							<span
								v-if="meeting.quorumCalledAt !== null"
								class="status-badge called"
							>
								Called
							</span>
							<span v-else class="status-badge not-called"> Not Called </span>
						</td>
						<td>{{ meeting.motionSummaries.length }}</td>
						<td class="actions-cell">
							<button
								class="btn btn-small"
								@click="viewMeeting(meeting.meetingId)"
							>
								View Details
							</button>
							<button
								class="btn btn-small"
								@click="viewQuorum(meeting.meetingId)"
							>
								Quorum
							</button>
						</td>
					</tr>
				</tbody>
			</table>

			<div v-if="totalPages > 1" class="pagination">
				<button
					class="btn btn-small"
					:disabled="currentPage === 1"
					@click="goToPage(currentPage - 1)"
				>
					Previous
				</button>
				<span class="page-info">
					Page {{ currentPage }} of {{ totalPages }} ({{ totalMeetings }} total)
				</span>
				<button
					class="btn btn-small"
					:disabled="currentPage >= totalPages"
					@click="goToPage(currentPage + 1)"
				>
					Next
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.meeting-list {
	max-width: 1400px;
	margin: 0 auto;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 2rem;
}

.header h2 {
	margin: 0;
	color: #2c3e50;
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

.meetings-table {
	width: 100%;
	border-collapse: collapse;
}

.meetings-table th {
	background-color: #f8f9fa;
	padding: 1rem;
	text-align: left;
	font-weight: 600;
	color: #2c3e50;
	border-bottom: 2px solid #dee2e6;
}

.meetings-table td {
	padding: 1rem;
	border-bottom: 1px solid #dee2e6;
}

.meetings-table tbody tr:hover {
	background-color: #f8f9fa;
}

.meeting-name {
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
	border-radius: 20px;
	font-weight: 500;
	font-size: 0.75rem;
}

.status-badge.called {
	background: #c8e6c9;
	color: #2e7d32;
}

.status-badge.not-called {
	background: #fff3e0;
	color: #ef6c00;
}

.actions-cell {
	display: flex;
	gap: 0.5rem;
}

.pagination {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 1rem;
	border-top: 1px solid #dee2e6;
}

.page-info {
	color: #666;
	font-size: 0.875rem;
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
	background-color: #34495e;
	color: white;
}

.btn:hover {
	background-color: #2c3e50;
}

.btn-small {
	padding: 0.25rem 0.75rem;
	font-size: 0.8125rem;
}

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
</style>
