<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { getMeetings, deleteMeeting } from "../../services/api";
import type { MeetingWithPool } from "@mcdc-convention-voting/shared";

const router = useRouter();

const MEETINGS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;
const MIN_PAGE = 1;

const meetings = ref<MeetingWithPool[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalMeetings = ref(INITIAL_TOTAL);

const totalPages = computed(() =>
	Math.ceil(totalMeetings.value / MEETINGS_PER_PAGE),
);

// Modal state for delete
const showDeleteModal = ref(false);
const meetingToDelete = ref<number | null>(null);

async function loadMeetings(): Promise<void> {
	loading.value = true;
	error.value = null;

	try {
		const response = await getMeetings(currentPage.value, MEETINGS_PER_PAGE);
		const { data, total } = response;
		meetings.value = data;
		totalMeetings.value = total;
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to load meetings";
	} finally {
		loading.value = false;
	}
}

function editMeeting(meetingId: number): void {
	void router.push(`/admin/meetings/${meetingId}/edit`);
}

function viewMotions(meetingId: number): void {
	void router.push(`/admin/meetings/${meetingId}/motions`);
}

function viewQuorum(meetingId: number): void {
	void router.push(`/admin/meetings/${meetingId}/quorum`);
}

function requestDelete(meetingId: number): void {
	meetingToDelete.value = meetingId;
	showDeleteModal.value = true;
}

function cancelDelete(): void {
	showDeleteModal.value = false;
	meetingToDelete.value = null;
}

async function handleDelete(): Promise<void> {
	if (meetingToDelete.value === null) {
		return;
	}

	showDeleteModal.value = false;
	const { value: meetingId } = meetingToDelete;
	meetingToDelete.value = null;

	try {
		await deleteMeeting(meetingId);
		await loadMeetings();
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to delete meeting";
	}
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
			<div class="actions">
				<router-link to="/admin/meetings/create" class="btn btn-primary">
					Create Meeting
				</router-link>
			</div>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading meetings...</div>

		<div v-else-if="meetings.length === 0" class="empty">
			No meetings found. Create a meeting to get started.
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
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="meeting in meetings" :key="meeting.id">
						<td class="meeting-name">
							{{ meeting.name }}
						</td>
						<td class="description">
							{{ meeting.description || "—" }}
						</td>
						<td>{{ formatDate(meeting.startDate) }}</td>
						<td>{{ formatDate(meeting.endDate) }}</td>
						<td>{{ meeting.quorumVotingPoolName }}</td>
						<td class="actions-cell">
							<button class="btn btn-small" @click="viewMotions(meeting.id)">
								Motions
							</button>
							<button class="btn btn-small" @click="viewQuorum(meeting.id)">
								Quorum
							</button>
							<button class="btn btn-small" @click="editMeeting(meeting.id)">
								Edit
							</button>
							<button
								class="btn btn-small btn-danger"
								@click="requestDelete(meeting.id)"
							>
								Delete
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

		<!-- Delete Confirmation Modal -->
		<div v-if="showDeleteModal" class="modal" @click="cancelDelete">
			<div class="modal-content" @click.stop>
				<h3>Confirm Delete Meeting</h3>
				<p>
					Are you sure you want to delete this meeting? This will also delete
					all motions and choices associated with it. This action cannot be
					undone.
				</p>
				<div class="modal-actions">
					<button class="btn btn-danger" @click="handleDelete">
						Yes, Delete Meeting
					</button>
					<button class="btn btn-secondary" @click="cancelDelete">
						Cancel
					</button>
				</div>
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
	max-width: 250px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
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

.btn-danger {
	background-color: #dc3545;
	color: white;
}

.btn-danger:hover {
	background-color: #c82333;
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
</style>
