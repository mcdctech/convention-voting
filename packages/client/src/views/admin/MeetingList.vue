<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import { getMeetings, deleteMeeting } from "../../services/api";
import { useAuth } from "../../composables/useAuth";
import { useAdminMeeting } from "../../composables/useAdminMeeting";
import TablePagination from "../../components/TablePagination.vue";
import type { MeetingWithPool } from "@mcdc-convention-voting/shared";

const router = useRouter();
const { isAdmin } = useAuth();
const { isJoined, joinedMeetingId, currentMeeting } = useAdminMeeting();

const MEETINGS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;

const meetings = ref<MeetingWithPool[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalMeetings = ref(INITIAL_TOTAL);

// Filter meetings to only show joined meeting when in joined mode
const filteredMeetings = computed(() => {
	if (!isJoined.value) {
		return meetings.value;
	}
	return meetings.value.filter((m) => m.id === joinedMeetingId.value);
});

const totalPages = computed(() =>
	Math.ceil(totalMeetings.value / MEETINGS_PER_PAGE),
);

// Modal state for delete
const showDeleteModal = ref(false);
const meetingToDelete = ref<number | null>(null);

// Scroll shadow indicator state
const scrollWrapper = ref<HTMLElement | null>(null);
const canScrollRight = ref(false);

async function loadMeetings(): Promise<void> {
	loading.value = true;
	error.value = null;

	try {
		const response = await getMeetings(currentPage.value, MEETINGS_PER_PAGE);
		const { data, pagination } = response;
		meetings.value = data;
		totalMeetings.value = pagination.total;
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
	currentPage.value = page;
	void loadMeetings();
}

// Check if there's horizontal scroll content to the right
function updateScrollShadow(): void {
	const wrapper = scrollWrapper.value;
	if (wrapper === null) {
		canScrollRight.value = false;
		return;
	}
	const scrollThreshold = 1;
	canScrollRight.value =
		wrapper.scrollWidth - wrapper.scrollLeft - wrapper.clientWidth >
		scrollThreshold;
}

// Handle scroll events on the wrapper
function handleScrollEvent(): void {
	updateScrollShadow();
}

onMounted(() => {
	void loadMeetings();

	// Check scroll shadow after DOM is ready
	void nextTick(() => {
		updateScrollShadow();
	});

	// Update on window resize
	window.addEventListener("resize", updateScrollShadow);
});

onUnmounted(() => {
	window.removeEventListener("resize", updateScrollShadow);
});

// Update scroll shadow when meetings change
watch(filteredMeetings, () => {
	void nextTick(() => {
		updateScrollShadow();
	});
});
</script>

<template>
	<div class="meeting-list">
		<div class="header">
			<h2>{{ isJoined ? currentMeeting?.meeting.name : "Meetings" }}</h2>
			<div v-if="isAdmin" class="actions">
				<router-link to="/admin/meetings/create" class="btn btn-primary">
					Create Meeting
				</router-link>
			</div>
		</div>

		<!-- Meeting focus indicator -->
		<div v-if="isJoined && currentMeeting" class="focus-indicator">
			<span class="focus-label">
				Focused on:
				<strong>{{ currentMeeting.meeting.name }}</strong>
			</span>
			<span class="focus-hint">
				Use the Meetings menu to leave and see all meetings
			</span>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading meetings...</div>

		<div v-else-if="filteredMeetings.length === 0" class="empty">
			No meetings found. Create a meeting to get started.
		</div>

		<div v-else class="table-container">
			<div
				class="table-scroll-container"
				:class="{ 'has-scroll-right': canScrollRight }"
			>
				<div
					ref="scrollWrapper"
					class="table-scroll-wrapper"
					@scroll="handleScrollEvent"
				>
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
							<tr v-for="meeting in filteredMeetings" :key="meeting.id">
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
									<button
										class="btn btn-small"
										@click="viewMotions(meeting.id)"
									>
										Motions
									</button>
									<button class="btn btn-small" @click="viewQuorum(meeting.id)">
										Quorum
									</button>
									<button
										class="btn btn-small"
										@click="editMeeting(meeting.id)"
									>
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
				</div>
			</div>

			<TablePagination
				:current-page="currentPage"
				:total-pages="totalPages"
				:total-items="totalMeetings"
				@page-change="goToPage"
			/>
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

.focus-indicator {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 1rem;
	margin-bottom: 1rem;
	padding: 0.75rem 1rem;
	background-color: #e3f2fd;
	border: 1px solid #90caf9;
	border-radius: 8px;
	color: #1565c0;
}

.focus-label {
	font-size: 0.9375rem;
}

.focus-label strong {
	color: #0d47a1;
}

.focus-hint {
	font-size: 0.875rem;
	color: #1976d2;
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

/* Container for shadow indicator - doesn't scroll */
.table-scroll-container {
	position: relative;
	overflow: hidden;
}

/* Dynamic shadow indicator when there's content to scroll right */
.table-scroll-container.has-scroll-right::after {
	content: "";
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	width: 30px;
	background: linear-gradient(to left, rgba(0, 0, 0, 0.1) 0%, transparent 100%);
	pointer-events: none;
	z-index: 2;
}

/* Inner wrapper that handles both horizontal and vertical scrolling */
.table-scroll-wrapper {
	overflow-x: auto;
	overflow-y: auto;
	max-height: 70vh;
	-webkit-overflow-scrolling: touch;
}

.meetings-table {
	width: 100%;
	min-width: 900px;
	border-collapse: collapse;
}

.meetings-table th {
	background-color: #f8f9fa;
	padding: 1rem;
	text-align: left;
	font-weight: 600;
	color: #2c3e50;
	border-bottom: 2px solid #dee2e6;
	position: sticky;
	top: 0;
	z-index: 1;
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
