<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { getUsersByDateRange, bulkDeleteUsers } from "../../services/api";
import TablePagination from "../../components/TablePagination.vue";
import type { User } from "@mcdc-convention-voting/shared";

const router = useRouter();

// Constants
const USERS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;
const NO_USERS = 0;
const MAX_USERS_FOR_SELECT_ALL = 10000;

const users = ref<User[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalUsers = ref(INITIAL_TOTAL);

// Date range inputs
const startDate = ref("");
const endDate = ref("");

// Selection state
const selectedUserIds = ref<Set<string>>(new Set());
const selectingAll = ref(false);

// Delete confirmation modal
const showDeleteModal = ref(false);
const deleting = ref(false);
const deleteResult = ref<{
	deleted: number;
	skipped: number;
	skippedAdmins: string[];
} | null>(null);

const totalPages = computed(() => Math.ceil(totalUsers.value / USERS_PER_PAGE));

const hasUsers = computed(() => users.value.length > NO_USERS);

const selectedCount = computed(() => selectedUserIds.value.size);

const allSelected = computed(
	() => hasUsers.value && selectedUserIds.value.size === users.value.length,
);

function formatDate(date: Date): string {
	return new Date(date).toLocaleString();
}

async function searchUsers(): Promise<void> {
	if (startDate.value === "" || endDate.value === "") {
		error.value = "Please select both start and end dates";
		return;
	}

	loading.value = true;
	error.value = null;
	selectedUserIds.value = new Set();

	try {
		const response = await getUsersByDateRange(
			startDate.value,
			endDate.value,
			currentPage.value,
			USERS_PER_PAGE,
		);
		const { data, total } = response;
		users.value = data;
		totalUsers.value = total;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to search users";
	} finally {
		loading.value = false;
	}
}

function toggleSelectAll(): void {
	if (allSelected.value) {
		selectedUserIds.value = new Set();
	} else {
		selectedUserIds.value = new Set(users.value.map((u) => u.id));
	}
}

async function selectAllUsers(): Promise<void> {
	if (startDate.value === "" || endDate.value === "") {
		return;
	}

	selectingAll.value = true;
	error.value = null;

	try {
		// Fetch all users (up to MAX_USERS_FOR_SELECT_ALL) to get their IDs
		const response = await getUsersByDateRange(
			startDate.value,
			endDate.value,
			INITIAL_PAGE,
			MAX_USERS_FOR_SELECT_ALL,
		);
		// Select all non-admin users
		const allUserIds = response.data.filter((u) => !u.isAdmin).map((u) => u.id);
		selectedUserIds.value = new Set(allUserIds);
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to select all users";
	} finally {
		selectingAll.value = false;
	}
}

function clearSelection(): void {
	selectedUserIds.value = new Set();
}

function toggleUser(userId: string): void {
	const newSet = new Set(selectedUserIds.value);
	if (newSet.has(userId)) {
		newSet.delete(userId);
	} else {
		newSet.add(userId);
	}
	selectedUserIds.value = newSet;
}

function isSelected(userId: string): boolean {
	return selectedUserIds.value.has(userId);
}

function requestDelete(): void {
	if (selectedCount.value === NO_USERS) {
		return;
	}
	showDeleteModal.value = true;
}

function cancelDelete(): void {
	showDeleteModal.value = false;
}

async function confirmDelete(): Promise<void> {
	if (selectedCount.value === NO_USERS) {
		return;
	}

	deleting.value = true;
	error.value = null;

	try {
		const response = await bulkDeleteUsers([...selectedUserIds.value]);
		if (response.data !== undefined) {
			deleteResult.value = response.data;
			// Clear selection and refresh
			selectedUserIds.value = new Set();
			await searchUsers();
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to delete users";
	} finally {
		deleting.value = false;
		showDeleteModal.value = false;
	}
}

function closeResultModal(): void {
	deleteResult.value = null;
}

function goToPage(page: number): void {
	currentPage.value = page;
	void searchUsers();
}

function goBack(): void {
	void router.push("/admin/users");
}
</script>

<template>
	<div class="user-cleanup">
		<div class="header">
			<h2>User Cleanup</h2>
			<button class="btn btn-secondary" @click="goBack">
				Back to User List
			</button>
		</div>

		<div class="info-box">
			<p>
				Use this tool to find and delete users created within a specific date
				range. This is useful for cleaning up users that were created from a
				corrupted CSV upload.
			</p>
			<p>
				<strong>Note:</strong> Admin users cannot be deleted and will be
				skipped.
			</p>
		</div>

		<div class="search-section">
			<div class="date-inputs">
				<div class="date-field">
					<label for="start-date">Start Date:</label>
					<input
						id="start-date"
						v-model="startDate"
						type="datetime-local"
						:disabled="loading"
					/>
				</div>
				<div class="date-field">
					<label for="end-date">End Date:</label>
					<input
						id="end-date"
						v-model="endDate"
						type="datetime-local"
						:disabled="loading"
					/>
				</div>
				<button
					class="btn btn-primary"
					:disabled="loading || !startDate || !endDate"
					@click="searchUsers"
				>
					{{ loading ? "Searching..." : "Search Users" }}
				</button>
			</div>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="hasUsers" class="results-section">
			<div class="results-header">
				<div class="results-info">
					<strong>Found {{ totalUsers }} users</strong>
					<span v-if="selectedCount > 0" class="selected-count">
						({{ selectedCount }} selected)
					</span>
				</div>
				<div class="results-actions">
					<button
						class="btn btn-secondary"
						:disabled="selectingAll || totalUsers === 0"
						@click="selectAllUsers"
					>
						{{
							selectingAll ? "Selecting..." : `Select All ${totalUsers} Users`
						}}
					</button>
					<button
						v-if="selectedCount > 0"
						class="btn btn-secondary"
						@click="clearSelection"
					>
						Clear Selection
					</button>
					<button
						class="btn btn-danger"
						:disabled="selectedCount === 0 || deleting"
						@click="requestDelete"
					>
						Delete Selected ({{ selectedCount }})
					</button>
				</div>
			</div>

			<table class="users-table">
				<thead>
					<tr>
						<th class="checkbox-col">
							<input
								type="checkbox"
								:checked="allSelected"
								:indeterminate="selectedCount > 0 && !allSelected"
								@change="toggleSelectAll"
							/>
						</th>
						<th>Username</th>
						<th>Name</th>
						<th>Voter ID</th>
						<th>Role</th>
						<th>Created At</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="user in users"
						:key="user.id"
						:class="{ selected: isSelected(user.id) }"
					>
						<td class="checkbox-col">
							<input
								type="checkbox"
								:checked="isSelected(user.id)"
								:disabled="user.isAdmin"
								@change="toggleUser(user.id)"
							/>
						</td>
						<td>{{ user.username }}</td>
						<td>{{ user.firstName }} {{ user.lastName }}</td>
						<td>{{ user.voterId ?? "N/A" }}</td>
						<td>
							<span
								:class="{
									'role-admin': user.isAdmin,
									'role-watcher': user.isWatcher,
									'role-voter': !user.isAdmin && !user.isWatcher,
								}"
							>
								{{
									user.isAdmin ? "Admin" : user.isWatcher ? "Watcher" : "Voter"
								}}
							</span>
						</td>
						<td>{{ formatDate(user.createdAt) }}</td>
					</tr>
				</tbody>
			</table>

			<TablePagination
				:current-page="currentPage"
				:total-pages="totalPages"
				:total-items="totalUsers"
				@page-change="goToPage"
			/>
		</div>

		<div v-else-if="!loading && startDate && endDate" class="no-results">
			No users found in the specified date range.
		</div>

		<!-- Delete Confirmation Modal -->
		<div v-if="showDeleteModal" class="modal" @click="cancelDelete">
			<div class="modal-content" @click.stop>
				<h3>Confirm Delete</h3>
				<p>
					Are you sure you want to delete
					<strong>{{ selectedCount }}</strong> user(s)?
				</p>
				<p class="warning-text">This action cannot be undone.</p>
				<div class="modal-actions">
					<button
						class="btn btn-danger"
						:disabled="deleting"
						@click="confirmDelete"
					>
						{{ deleting ? "Deleting..." : "Yes, Delete" }}
					</button>
					<button
						class="btn btn-secondary"
						:disabled="deleting"
						@click="cancelDelete"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>

		<!-- Delete Result Modal -->
		<div v-if="deleteResult" class="modal" @click="closeResultModal">
			<div class="modal-content" @click.stop>
				<h3>Delete Complete</h3>
				<div class="result-summary">
					<p>
						<strong>{{ deleteResult.deleted }}</strong> user(s) deleted
						successfully.
					</p>
					<p v-if="deleteResult.skipped > 0" class="skipped-info">
						<strong>{{ deleteResult.skipped }}</strong> admin user(s) were
						skipped:
						<span class="skipped-names">{{
							deleteResult.skippedAdmins.join(", ")
						}}</span>
					</p>
				</div>
				<button class="btn" @click="closeResultModal">Close</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.user-cleanup {
	max-width: 1200px;
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

.info-box {
	background-color: #e3f2fd;
	border: 1px solid #90caf9;
	border-radius: 4px;
	padding: 1rem;
	margin-bottom: 1.5rem;
}

.info-box p {
	margin: 0.5rem 0;
	color: #1565c0;
}

.info-box p:first-child {
	margin-top: 0;
}

.info-box p:last-child {
	margin-bottom: 0;
}

.search-section {
	background: white;
	border-radius: 8px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	padding: 1.5rem;
	margin-bottom: 1.5rem;
}

.date-inputs {
	display: flex;
	gap: 1.5rem;
	align-items: flex-end;
	flex-wrap: wrap;
}

.date-field {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.date-field label {
	font-weight: 500;
	color: #2c3e50;
}

.date-field input {
	padding: 0.5rem 0.75rem;
	border: 1px solid #dee2e6;
	border-radius: 4px;
	font-size: 0.875rem;
}

.date-field input:focus {
	outline: none;
	border-color: #1976d2;
	box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
}

.error {
	padding: 1rem;
	margin: 1rem 0;
	border-radius: 4px;
	background-color: #ffebee;
	color: #c62828;
}

.results-section {
	background: white;
	border-radius: 8px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	overflow: hidden;
}

.results-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 1rem;
	border-bottom: 1px solid #dee2e6;
	background-color: #f8f9fa;
}

.results-info {
	color: #2c3e50;
}

.selected-count {
	color: #1976d2;
	margin-left: 0.5rem;
}

.users-table {
	width: 100%;
	border-collapse: collapse;
}

.users-table th,
.users-table td {
	padding: 1rem;
	text-align: left;
	border-bottom: 1px solid #dee2e6;
}

.users-table th {
	background-color: #f8f9fa;
	font-weight: 600;
	color: #2c3e50;
}

.users-table tbody tr:hover {
	background-color: #fafafa;
}

.users-table tbody tr.selected {
	background-color: #e3f2fd;
}

.checkbox-col {
	width: 40px;
	text-align: center;
}

.role-admin {
	display: inline-block;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-size: 0.75rem;
	font-weight: 600;
	background-color: #e3f2fd;
	color: #1565c0;
}

.role-watcher {
	display: inline-block;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-size: 0.75rem;
	font-weight: 600;
	background-color: #f3e5f5;
	color: #7b1fa2;
}

.role-voter {
	display: inline-block;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-size: 0.75rem;
	font-weight: 600;
	background-color: #e8f5e9;
	color: #2e7d32;
}

.no-results {
	padding: 2rem;
	text-align: center;
	color: #666;
	background: white;
	border-radius: 8px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	background-color: #34495e;
	color: white;
	cursor: pointer;
	font-size: 0.875rem;
	font-weight: 500;
	text-decoration: none;
	display: inline-block;
	transition: all 0.2s;
}

.btn:hover:not(:disabled) {
	background-color: #2c3e50;
}

.btn-primary {
	background-color: #1976d2;
}

.btn-primary:hover:not(:disabled) {
	background-color: #1565c0;
}

.btn-secondary {
	background-color: #757575;
}

.btn-secondary:hover:not(:disabled) {
	background-color: #616161;
}

.btn-danger {
	background-color: #c62828;
}

.btn-danger:hover:not(:disabled) {
	background-color: #b71c1c;
}

.btn:disabled {
	background-color: #bdbdbd;
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
	justify-content: center;
	align-items: center;
	z-index: 1000;
}

.modal-content {
	background: white;
	padding: 2rem;
	border-radius: 8px;
	max-width: 500px;
	width: 90%;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal-content h3 {
	margin-top: 0;
	margin-bottom: 1rem;
	color: #2c3e50;
}

.warning-text {
	color: #c62828;
	font-weight: 500;
}

.modal-actions {
	display: flex;
	gap: 1rem;
	margin-top: 1.5rem;
	justify-content: flex-end;
}

.result-summary {
	background-color: #f5f5f5;
	padding: 1rem;
	border-radius: 4px;
	margin: 1rem 0;
}

.result-summary p {
	margin: 0.5rem 0;
}

.skipped-info {
	color: #f57c00;
}

.skipped-names {
	font-family: monospace;
	font-size: 0.875rem;
}
</style>
