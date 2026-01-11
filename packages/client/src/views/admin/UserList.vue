<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
	getUsers,
	disableUser,
	enableUser,
	resetUserPassword,
} from "../../services/api";
import type { User } from "@mcdc-convention-voting/shared";

const router = useRouter();

// Constants
const USERS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;

const users = ref<User[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalUsers = ref(INITIAL_TOTAL);

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
		const response = await getUsers(currentPage.value, USERS_PER_PAGE);
		const { data, total } = response;
		users.value = data;
		totalUsers.value = total;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load users";
	} finally {
		loading.value = false;
	}
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
		<h2>User Management</h2>

		<div v-if="loading" class="loading">Loading users...</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="!loading && !error" class="users-container">
			<div class="users-header">
				<p>Total Users: {{ totalUsers }}</p>
			</div>

			<table class="users-table">
				<thead>
					<tr>
						<th>Username</th>
						<th>Name</th>
						<th>Voter ID</th>
						<th>Pools</th>
						<th>Status</th>
						<th>Admin</th>
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
						<td>{{ user.isAdmin ? "Yes" : "No" }}</td>
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
								class="btn btn-small btn-secondary"
								@click="requestResetPassword(user.id)"
							>
								Reset Password
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
					Page {{ currentPage }} of {{ totalPages }}
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
	max-width: 1200px;
}

h2 {
	margin-bottom: 1.5rem;
	color: #2c3e50;
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

.users-container {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.users-header {
	margin-bottom: 1rem;
	padding-bottom: 1rem;
	border-bottom: 1px solid #e0e0e0;
}

.users-table {
	width: 100%;
	border-collapse: collapse;
}

.users-table th,
.users-table td {
	padding: 0.75rem;
	text-align: left;
	border-bottom: 1px solid #e0e0e0;
}

.users-table th {
	background-color: #f5f5f5;
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

.actions {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	background-color: #1976d2;
	color: white;
	cursor: pointer;
	font-size: 0.875rem;
	transition: background-color 0.2s;
}

.btn:hover:not(:disabled) {
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

.pagination {
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 1rem;
	margin-top: 1.5rem;
	padding-top: 1rem;
	border-top: 1px solid #e0e0e0;
}

.page-info {
	font-size: 0.875rem;
	color: #616161;
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
