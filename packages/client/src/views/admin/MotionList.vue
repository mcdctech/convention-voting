<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { MotionStatus } from "@mcdc-convention-voting/shared";
import {
	getMotions,
	getMeeting,
	deleteMotion,
	updateMotionStatus,
} from "../../services/api";
import type {
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
const MIN_PAGE = 1;
const DECIMAL_RADIX = 10;

const meeting = ref<MeetingWithPool | null>(null);
const motions = ref<MotionWithPool[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalMotions = ref(INITIAL_TOTAL);

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
		const { data, total } = response;
		motions.value = data;
		totalMotions.value = total;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load motions";
	} finally {
		loading.value = false;
	}
}

function editMotion(motionId: number): void {
	void router.push(`/admin/motions/${motionId}/edit`);
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
	if (page >= MIN_PAGE && page <= totalPages.value) {
		currentPage.value = page;
		void loadMotions();
	}
}

function goBack(): void {
	void router.push("/admin/meetings");
}

onMounted(() => {
	void loadMeeting();
	void loadMotions();
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
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="motion in motions" :key="motion.id">
						<td class="motion-name">
							{{ motion.name }}
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
						<td class="actions-cell">
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
								v-if="canStartVoting(motion.status)"
								class="btn btn-small btn-danger"
								@click="requestDelete(motion.id)"
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
					Page {{ currentPage }} of {{ totalPages }} ({{ totalMotions }} total)
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
