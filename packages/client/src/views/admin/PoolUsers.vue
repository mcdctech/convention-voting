<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { getPool, getPoolUsers, removeUserFromPool } from "../../services/api";
import type { Pool, User } from "@mcdc-convention-voting/shared";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();

const USERS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;
const MIN_PAGE = 1;

const pool = ref<Pool | null>(null);
const users = ref<User[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalUsers = ref(INITIAL_TOTAL);

const totalPages = computed(() => Math.ceil(totalUsers.value / USERS_PER_PAGE));

// Modal state for remove user
const showRemoveModal = ref(false);
const userToRemove = ref<string | null>(null);
const userToRemoveName = ref<string | null>(null);

async function loadPool(): Promise<void> {
	loading.value = true;
	error.value = null;

	try {
		const poolId = Number.parseInt(props.id, 10);
		if (Number.isNaN(poolId)) {
			error.value = "Invalid pool ID";
			return;
		}

		const response = await getPool(poolId);
		if (response.data !== undefined) {
			const { data } = response;
			pool.value = data;
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load pool";
	} finally {
		loading.value = false;
	}
}

async function loadUsers(): Promise<void> {
	loading.value = true;
	error.value = null;

	try {
		const poolId = Number.parseInt(props.id, 10);
		if (Number.isNaN(poolId)) {
			error.value = "Invalid pool ID";
			return;
		}

		const response = await getPoolUsers(
			poolId,
			currentPage.value,
			USERS_PER_PAGE,
		);
		const { data, total } = response;
		users.value = data;
		totalUsers.value = total;
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to load pool users";
	} finally {
		loading.value = false;
	}
}

function requestRemove(userId: string, userName: string): void {
	userToRemove.value = userId;
	userToRemoveName.value = userName;
	showRemoveModal.value = true;
}

function cancelRemove(): void {
	showRemoveModal.value = false;
	userToRemove.value = null;
	userToRemoveName.value = null;
}

async function handleRemove(): Promise<void> {
	if (userToRemove.value === null) {
		return;
	}

	showRemoveModal.value = false;
	const { value: userId } = userToRemove;
	userToRemove.value = null;
	userToRemoveName.value = null;

	try {
		const poolId = Number.parseInt(props.id, 10);
		await removeUserFromPool(poolId, userId);
		await loadUsers();
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to remove user from pool";
	}
}

function goToPage(page: number): void {
	if (page >= MIN_PAGE && page <= totalPages.value) {
		currentPage.value = page;
		void loadUsers();
	}
}

function goBack(): void {
	void router.push("/admin/pools");
}

onMounted(() => {
	void loadPool();
	void loadUsers();
});
</script>

<template>
	<div class="pool-users">
		<div class="header">
			<div class="header-content">
				<h2>Pool Users</h2>
				<div v-if="pool" class="pool-info">
					<div class="pool-detail">
						<strong>Pool:</strong> {{ pool.poolName }}
					</div>
					<div class="pool-detail">
						<strong>Key:</strong> <code>{{ pool.poolKey }}</code>
					</div>
				</div>
			</div>
			<button class="btn btn-secondary" @click="goBack">Back to Pools</button>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading users...</div>

		<div v-else-if="users.length === 0" class="empty">
			No users in this pool yet.
		</div>

		<div v-else class="table-container">
			<table class="users-table">
				<thead>
					<tr>
						<th>Username</th>
						<th>Voter ID</th>
						<th>Name</th>
						<th>Status</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="user in users" :key="user.id">
						<td class="username">
							{{ user.username }}
						</td>
						<td>{{ user.voterId || "—" }}</td>
						<td>{{ user.firstName }} {{ user.lastName }}</td>
						<td>
							<span class="status-badge" :class="{ disabled: user.isDisabled }">
								{{ user.isDisabled ? "Disabled" : "Active" }}
							</span>
						</td>
						<td class="actions-cell">
							<button
								class="btn btn-small btn-warning"
								@click="requestRemove(user.id, user.username)"
							>
								Remove from Pool
							</button>
						</td>
					</tr>
				</tbody>
			</table>

			<div class="pagination">
				<button
					class="btn btn-small"
					:disabled="currentPage === 1"
					@click="goToPage(currentPage - 1)"
				>
					Previous
				</button>
				<span class="page-info">
					Page {{ currentPage }} of {{ totalPages }} ({{ totalUsers }} total)
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

		<!-- Remove Confirmation Modal -->
		<div v-if="showRemoveModal" class="modal" @click="cancelRemove">
			<div class="modal-content" @click.stop>
				<h3>Confirm Remove User</h3>
				<p>
					Are you sure you want to remove user
					<strong>{{ userToRemoveName }}</strong> from this pool?
				</p>
				<div class="modal-actions">
					<button class="btn btn-warning" @click="handleRemove">
						Yes, Remove User
					</button>
					<button class="btn btn-secondary" @click="cancelRemove">
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.pool-users {
	max-width: 1400px;
	margin: 0 auto;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 2rem;
	gap: 2rem;
}

.header-content {
	flex: 1;
}

.header h2 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.pool-info {
	display: flex;
	gap: 2rem;
}

.pool-detail {
	color: #616161;
}

.pool-detail strong {
	color: #2c3e50;
}

.pool-detail code {
	background-color: #f5f5f5;
	padding: 0.25rem 0.5rem;
	border-radius: 3px;
	font-family: monospace;
	color: #0066cc;
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

.users-table {
	width: 100%;
	border-collapse: collapse;
}

.users-table th {
	background-color: #f8f9fa;
	padding: 1rem;
	text-align: left;
	font-weight: 600;
	color: #2c3e50;
	border-bottom: 2px solid #dee2e6;
}

.users-table td {
	padding: 1rem;
	border-bottom: 1px solid #dee2e6;
}

.users-table tbody tr:hover {
	background-color: #f8f9fa;
}

.username {
	font-family: monospace;
	color: #0066cc;
	font-weight: 500;
}

.status-badge {
	display: inline-block;
	padding: 0.25rem 0.75rem;
	border-radius: 12px;
	font-size: 0.875rem;
	font-weight: 500;
	background-color: #d4edda;
	color: #155724;
}

.status-badge.disabled {
	background-color: #f8d7da;
	color: #721c24;
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

.btn-warning {
	background-color: #ffc107;
	color: #000;
}

.btn-warning:hover {
	background-color: #e0a800;
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
