<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
	getUsers,
	disableUser,
	enableUser,
	resetUserPassword,
} from "../../services/api";
import TablePagination from "../../components/TablePagination.vue";
import { useAuth } from "../../composables/useAuth";
import type { User } from "@mcdc-convention-voting/shared";

const router = useRouter();
const { currentUser } = useAuth();

// Constants
const USERS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;

const users = ref<User[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalUsers = ref(INITIAL_TOTAL);
const searchQuery = ref("");

const generatedPassword = ref<{
	username: string;
	password: string;
} | null>(null);

const showDisableModal = ref(false);
const userToDisable = ref<string | null>(null);
const showResetPasswordModal = ref(false);
const userToResetPassword = ref<string | null>(null);

const totalPages = computed(() => Math.ceil(totalUsers.value / USERS_PER_PAGE));

async function loadUsers(): Promise<void> {
	loading.value = true;
	error.value = null;

	try {
		const search = searchQuery.value.trim();
		const searchParam = search === "" ? undefined : search;
		const response = await getUsers(
			currentPage.value,
			USERS_PER_PAGE,
			searchParam,
		);
		const { data, pagination } = response;
		users.value = data;
		totalUsers.value = pagination.total;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load users";
	} finally {
		loading.value = false;
	}
}

function handleSearch(): void {
	currentPage.value = INITIAL_PAGE;
	void loadUsers();
}

function clearSearch(): void {
	searchQuery.value = "";
	currentPage.value = INITIAL_PAGE;
	void loadUsers();
}

function requestDisable(userId: string): void {
	userToDisable.value = userId;
	showDisableModal.value = true;
}

function cancelDisable(): void {
	showDisableModal.value = false;
	userToDisable.value = null;
}

async function handleDisable(): Promise<void> {
	if (userToDisable.value === null) {
		return;
	}

	showDisableModal.value = false;
	const { value: userId } = userToDisable;
	userToDisable.value = null;

	try {
		await disableUser(userId);
		await loadUsers();
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to disable user";
	}
}

async function handleEnable(userId: string): Promise<void> {
	try {
		await enableUser(userId);
		await loadUsers();
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to enable user";
	}
}

function requestResetPassword(userId: string): void {
	userToResetPassword.value = userId;
	showResetPasswordModal.value = true;
}

function cancelResetPassword(): void {
	showResetPasswordModal.value = false;
	userToResetPassword.value = null;
}

async function handleResetPassword(): Promise<void> {
	if (userToResetPassword.value === null) {
		return;
	}

	showResetPasswordModal.value = false;
	const { value: userId } = userToResetPassword;
	userToResetPassword.value = null;

	try {
		const response = await resetUserPassword(userId);
		if (response.data !== undefined) {
			const { data } = response;
			const { username, password } = data;
			generatedPassword.value = {
				username,
				password,
			};
			await loadUsers();
		}
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to reset password";
	}
}

function goToPage(page: number): void {
	currentPage.value = page;
	void loadUsers();
}

function editUser(userId: string): void {
	void router.push(`/admin/users/${userId}/edit`);
}

function closePasswordModal(): void {
	generatedPassword.value = null;
}

onMounted(() => {
	void loadUsers();
});
</script>

<template>
	<div class="user-list">
		<div class="header">
			<h2>Users</h2>
			<div class="header-actions">
				<router-link to="/admin/users/create" class="btn btn-primary">
					Create User
				</router-link>
				<router-link to="/admin/users/upload" class="btn btn-secondary">
					Upload CSV
				</router-link>
			</div>
		</div>

		<div v-if="loading" class="loading">Loading users...</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="!loading && !error" class="table-container">
			<div class="table-header">
				<div class="search-box">
					<input
						v-model="searchQuery"
						type="text"
						placeholder="Search by name, username, or voter ID..."
						class="search-input"
						@keyup.enter="handleSearch"
					/>
					<button class="btn btn-small" @click="handleSearch">Search</button>
					<button
						v-if="searchQuery"
						class="btn btn-small btn-secondary"
						@click="clearSearch"
					>
						Clear
					</button>
				</div>
			</div>

			<table class="users-table">
				<thead>
					<tr>
						<th>Username</th>
						<th>Name</th>
						<th>Voter ID</th>
						<th>Pools</th>
						<th>Status</th>
						<th>Role</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="user in users" :key="user.id">
						<td>{{ user.username }}</td>
						<td>{{ user.firstName }} {{ user.lastName }}</td>
						<td>{{ user.voterId ?? "N/A" }}</td>
						<td class="pools-cell">
							{{
								user.poolNames && user.poolNames.length > 0
									? user.poolNames.join(", ")
									: "—"
							}}
						</td>
						<td>
							<span
								:class="user.isDisabled ? 'status-disabled' : 'status-active'"
							>
								{{ user.isDisabled ? "Disabled" : "Active" }}
							</span>
						</td>
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
						<td class="actions">
							<button class="btn btn-small" @click="editUser(user.id)">
								Edit
							</button>
							<button
								v-if="!user.isDisabled"
								class="btn btn-small btn-warning"
								@click="requestDisable(user.id)"
							>
								Disable
							</button>
							<button
								v-else
								class="btn btn-small btn-success"
								@click="handleEnable(user.id)"
							>
								Enable
							</button>
							<button
								v-if="user.id !== currentUser?.id"
								class="btn btn-small btn-secondary"
								@click="requestResetPassword(user.id)"
							>
								Reset Password
							</button>
						</td>
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

		<div v-if="showDisableModal" class="modal" @click="cancelDisable">
			<div class="modal-content" @click.stop>
				<h3>Confirm Disable User</h3>
				<p>
					Are you sure you want to disable this user? They will not be able to
					log in.
				</p>
				<div class="modal-actions">
					<button class="btn btn-warning" @click="handleDisable">
						Yes, Disable User
					</button>
					<button class="btn btn-secondary" @click="cancelDisable">
						Cancel
					</button>
				</div>
			</div>
		</div>

		<div
			v-if="showResetPasswordModal"
			class="modal"
			@click="cancelResetPassword"
		>
			<div class="modal-content" @click.stop>
				<h3>Confirm Password Reset</h3>
				<p>
					Are you sure you want to reset this user's password? A new password
					will be generated.
				</p>
				<div class="modal-actions">
					<button class="btn btn-primary" @click="handleResetPassword">
						Yes, Reset Password
					</button>
					<button class="btn btn-secondary" @click="cancelResetPassword">
						Cancel
					</button>
				</div>
			</div>
		</div>

		<div v-if="generatedPassword" class="modal" @click="closePasswordModal">
			<div class="modal-content" @click.stop>
				<h3>Password Generated</h3>
				<p>
					<strong>IMPORTANT:</strong> Save this password now. It will not be
					shown again.
				</p>
				<div class="password-display">
					<p><strong>Username:</strong> {{ generatedPassword.username }}</p>
					<p><strong>Password:</strong> {{ generatedPassword.password }}</p>
				</div>
				<button class="btn" @click="closePasswordModal">Close</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.user-list {
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

.header-actions {
	display: flex;
	gap: 1rem;
}

.loading,
.error {
	padding: 1rem;
	margin: 1rem 0;
	border-radius: 4px;
}

.loading {
	background-color: #e3f2fd;
	color: #1976d2;
}

.error {
	background-color: #ffebee;
	color: #c62828;
}

.table-container {
	background: white;
	border-radius: 8px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	overflow: hidden;
}

.table-header {
	padding: 1rem;
	border-bottom: 1px solid #dee2e6;
}

.search-box {
	display: flex;
	gap: 0.5rem;
	align-items: center;
}

.search-input {
	padding: 0.5rem 0.75rem;
	border: 1px solid #dee2e6;
	border-radius: 4px;
	font-size: 0.875rem;
	width: 280px;
}

.search-input:focus {
	outline: none;
	border-color: #1976d2;
	box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
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

.status-active {
	color: #2e7d32;
	font-weight: 500;
}

.status-disabled {
	color: #c62828;
	font-weight: 500;
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

.actions {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
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

.btn:disabled {
	background-color: #bdbdbd;
	cursor: not-allowed;
}

.btn-small {
	padding: 0.375rem 0.75rem;
	font-size: 0.8125rem;
}

.btn-warning {
	background-color: #f57c00;
}

.btn-warning:hover:not(:disabled) {
	background-color: #ef6c00;
}

.btn-success {
	background-color: #388e3c;
}

.btn-success:hover:not(:disabled) {
	background-color: #2e7d32;
}

.btn-secondary {
	background-color: #757575;
}

.btn-secondary:hover:not(:disabled) {
	background-color: #616161;
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

.modal-actions {
	display: flex;
	gap: 1rem;
	margin-top: 1.5rem;
	justify-content: flex-end;
}

.password-display {
	background-color: #f5f5f5;
	padding: 1rem;
	border-radius: 4px;
	margin: 1rem 0;
	font-family: monospace;
}

.password-display p {
	margin: 0.5rem 0;
}
</style>
