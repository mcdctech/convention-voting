<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
	getPendingPoolKeys,
	getPools,
	resolvePendingPoolByCreating,
	resolvePendingPoolByRemapping,
	deletePendingPoolKey,
} from "../../services/api";
import TablePagination from "../../components/TablePagination.vue";
import type { Pool } from "@mcdc-convention-voting/shared";

// Constants
const ITEMS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;
const EMPTY_STRING = "";
const NO_ITEMS = 0;
const MAX_POOLS_FOR_DROPDOWN = 1000;

// Pending pool key interface (matches API response)
interface PendingPoolKey {
	poolKey: string;
	userCount: number;
	firstSeenAt: Date;
}

// State
const pendingKeys = ref<PendingPoolKey[]>([]);
const pools = ref<Pool[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalItems = ref(INITIAL_TOTAL);

// Modal state - Create Pool
const showCreateModal = ref(false);
const createModalKey = ref(EMPTY_STRING);
const createPoolName = ref(EMPTY_STRING);
const createDescription = ref(EMPTY_STRING);
const createLoading = ref(false);

// Modal state - Remap to Existing Pool
const showRemapModal = ref(false);
const remapModalKey = ref(EMPTY_STRING);
const selectedPoolId = ref<number | null>(null);
const remapLoading = ref(false);

// Modal state - Delete Confirmation
const showDeleteModal = ref(false);
const deleteModalKey = ref(EMPTY_STRING);
const deleteLoading = ref(false);

// Success message
const successMessage = ref<string | null>(null);

const totalPages = computed(() => Math.ceil(totalItems.value / ITEMS_PER_PAGE));

async function loadData(): Promise<void> {
	loading.value = true;
	error.value = null;
	successMessage.value = null;

	try {
		const [pendingResponse, poolsResponse] = await Promise.all([
			getPendingPoolKeys(currentPage.value, ITEMS_PER_PAGE),
			getPools(INITIAL_PAGE, MAX_POOLS_FOR_DROPDOWN),
		]);

		pendingKeys.value = pendingResponse.data;
		totalItems.value = pendingResponse.pagination.total;
		pools.value = poolsResponse.data.filter((p) => !p.isDisabled);
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load data";
	} finally {
		loading.value = false;
	}
}

// Create Pool Modal
function openCreateModal(poolKey: string): void {
	createModalKey.value = poolKey;
	createPoolName.value = poolKey; // Pre-fill with key as default name
	createDescription.value = EMPTY_STRING;
	showCreateModal.value = true;
}

function closeCreateModal(): void {
	showCreateModal.value = false;
	createModalKey.value = EMPTY_STRING;
	createPoolName.value = EMPTY_STRING;
	createDescription.value = EMPTY_STRING;
}

async function handleCreatePool(): Promise<void> {
	if (createPoolName.value.trim() === EMPTY_STRING) {
		error.value = "Pool name is required";
		return;
	}

	createLoading.value = true;
	error.value = null;

	try {
		const trimmedDescription = createDescription.value.trim();
		const result = await resolvePendingPoolByCreating({
			poolKey: createModalKey.value,
			poolName: createPoolName.value.trim(),
			description: trimmedDescription === "" ? undefined : trimmedDescription,
		});

		successMessage.value = `Created pool "${result.data?.pool.poolName}" and associated ${result.data?.usersUpdated} users`;
		closeCreateModal();
		await loadData();
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to create pool";
	} finally {
		createLoading.value = false;
	}
}

// Remap Modal
function openRemapModal(poolKey: string): void {
	remapModalKey.value = poolKey;
	selectedPoolId.value = null;
	showRemapModal.value = true;
}

function closeRemapModal(): void {
	showRemapModal.value = false;
	remapModalKey.value = EMPTY_STRING;
	selectedPoolId.value = null;
}

async function handleRemap(): Promise<void> {
	if (selectedPoolId.value === null) {
		error.value = "Please select a pool";
		return;
	}

	remapLoading.value = true;
	error.value = null;

	try {
		const result = await resolvePendingPoolByRemapping({
			pendingPoolKey: remapModalKey.value,
			targetPoolId: selectedPoolId.value,
		});

		successMessage.value = `Remapped ${result.data?.usersUpdated} users to pool "${result.data?.pool.poolName}"`;
		closeRemapModal();
		await loadData();
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to remap users";
	} finally {
		remapLoading.value = false;
	}
}

// Delete Modal
function openDeleteModal(poolKey: string): void {
	deleteModalKey.value = poolKey;
	showDeleteModal.value = true;
}

function closeDeleteModal(): void {
	showDeleteModal.value = false;
	deleteModalKey.value = EMPTY_STRING;
}

async function handleDelete(): Promise<void> {
	deleteLoading.value = true;
	error.value = null;

	try {
		const result = await deletePendingPoolKey(deleteModalKey.value);
		successMessage.value = `Deleted ${result.data?.deletedCount} pending records for "${deleteModalKey.value}"`;
		closeDeleteModal();
		await loadData();
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to delete";
	} finally {
		deleteLoading.value = false;
	}
}

function goToPage(page: number): void {
	currentPage.value = page;
	void loadData();
}

function formatDate(date: Date): string {
	return new Date(date).toLocaleDateString();
}

onMounted(() => {
	void loadData();
});
</script>

<template>
	<div class="missing-pools">
		<div class="header">
			<h2>Missing Pool Definitions</h2>
			<p class="description">
				These pool keys were used during CSV user imports but don't match any
				existing pools. Resolve each by creating a new pool or remapping users
				to an existing pool.
			</p>
		</div>

		<div v-if="successMessage" class="success">
			{{ successMessage }}
			<button class="dismiss" @click="successMessage = null">&times;</button>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading...</div>

		<div v-else-if="pendingKeys.length === NO_ITEMS" class="empty">
			No missing pool definitions. All pool keys from CSV imports match existing
			pools.
		</div>

		<div v-else class="table-container">
			<table class="pending-table">
				<thead>
					<tr>
						<th>Pool Key</th>
						<th>Users Count</th>
						<th>First Seen</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="pending in pendingKeys" :key="pending.poolKey">
						<td class="pool-key">{{ pending.poolKey }}</td>
						<td class="user-count">{{ pending.userCount }}</td>
						<td>{{ formatDate(pending.firstSeenAt) }}</td>
						<td class="actions-cell">
							<button
								class="btn btn-small btn-primary"
								@click="openCreateModal(pending.poolKey)"
							>
								Create Pool
							</button>
							<button
								class="btn btn-small btn-secondary"
								@click="openRemapModal(pending.poolKey)"
							>
								Remap to Existing
							</button>
							<button
								class="btn btn-small btn-danger"
								@click="openDeleteModal(pending.poolKey)"
							>
								Discard
							</button>
						</td>
					</tr>
				</tbody>
			</table>

			<TablePagination
				:current-page="currentPage"
				:total-pages="totalPages"
				:total-items="totalItems"
				@page-change="goToPage"
			/>
		</div>

		<!-- Create Pool Modal -->
		<div v-if="showCreateModal" class="modal" @click="closeCreateModal">
			<div class="modal-content" @click.stop>
				<h3>Create New Pool</h3>
				<p>
					Create a new pool with key "<strong>{{ createModalKey }}</strong
					>" and associate all users.
				</p>

				<div class="form-group">
					<label for="poolName"
						>Pool Name <span class="required">*</span></label
					>
					<input
						id="poolName"
						v-model="createPoolName"
						type="text"
						placeholder="Display name for the pool"
					/>
				</div>

				<div class="form-group">
					<label for="description">Description</label>
					<textarea
						id="description"
						v-model="createDescription"
						rows="2"
						placeholder="Optional description"
					/>
				</div>

				<div class="modal-actions">
					<button
						class="btn btn-primary"
						:disabled="createLoading"
						@click="handleCreatePool"
					>
						{{ createLoading ? "Creating..." : "Create Pool" }}
					</button>
					<button class="btn btn-secondary" @click="closeCreateModal">
						Cancel
					</button>
				</div>
			</div>
		</div>

		<!-- Remap Modal -->
		<div v-if="showRemapModal" class="modal" @click="closeRemapModal">
			<div class="modal-content" @click.stop>
				<h3>Remap to Existing Pool</h3>
				<p>
					Users with key "<strong>{{ remapModalKey }}</strong
					>" will be added to the selected pool.
				</p>

				<div class="form-group">
					<label for="targetPool"
						>Select Pool <span class="required">*</span></label
					>
					<select id="targetPool" v-model="selectedPoolId">
						<option :value="null" disabled>-- Select a pool --</option>
						<option v-for="pool in pools" :key="pool.id" :value="pool.id">
							{{ pool.poolName }} ({{ pool.poolKey }})
						</option>
					</select>
				</div>

				<div class="modal-actions">
					<button
						class="btn btn-primary"
						:disabled="remapLoading || selectedPoolId === null"
						@click="handleRemap"
					>
						{{ remapLoading ? "Remapping..." : "Remap Users" }}
					</button>
					<button class="btn btn-secondary" @click="closeRemapModal">
						Cancel
					</button>
				</div>
			</div>
		</div>

		<!-- Delete Confirmation Modal -->
		<div v-if="showDeleteModal" class="modal" @click="closeDeleteModal">
			<div class="modal-content" @click.stop>
				<h3>Discard Pending Pool Key</h3>
				<p>
					Are you sure you want to discard all pending records for "<strong>{{
						deleteModalKey
					}}</strong
					>"? Users will not be associated with any pool for this key.
				</p>

				<div class="modal-actions">
					<button
						class="btn btn-danger"
						:disabled="deleteLoading"
						@click="handleDelete"
					>
						{{ deleteLoading ? "Deleting..." : "Yes, Discard" }}
					</button>
					<button class="btn btn-secondary" @click="closeDeleteModal">
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.missing-pools {
	max-width: 1200px;
	margin: 0 auto;
}

.header {
	margin-bottom: 2rem;
}

.header h2 {
	margin: 0 0 0.5rem 0;
	color: #2c3e50;
}

.description {
	color: #666;
	margin: 0;
}

.success {
	background-color: #d4edda;
	color: #155724;
	padding: 1rem;
	border-radius: 4px;
	margin-bottom: 1rem;
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.success .dismiss {
	background: none;
	border: none;
	font-size: 1.25rem;
	cursor: pointer;
	color: #155724;
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

.pending-table {
	width: 100%;
	border-collapse: collapse;
}

.pending-table th {
	background-color: #f8f9fa;
	padding: 1rem;
	text-align: left;
	font-weight: 600;
	color: #2c3e50;
	border-bottom: 2px solid #dee2e6;
}

.pending-table td {
	padding: 1rem;
	border-bottom: 1px solid #dee2e6;
}

.pending-table tbody tr:hover {
	background-color: #f8f9fa;
}

.pool-key {
	font-family: monospace;
	color: #d35400;
	font-weight: 500;
}

.user-count {
	font-weight: 600;
}

.actions-cell {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.875rem;
	font-weight: 500;
	transition: all 0.2s;
}

.btn-small {
	padding: 0.25rem 0.75rem;
	font-size: 0.8125rem;
}

.btn-primary {
	background-color: #007bff;
	color: white;
}

.btn-primary:hover:not(:disabled) {
	background-color: #0056b3;
}

.btn-secondary {
	background-color: #6c757d;
	color: white;
}

.btn-secondary:hover:not(:disabled) {
	background-color: #545b62;
}

.btn-danger {
	background-color: #dc3545;
	color: white;
}

.btn-danger:hover:not(:disabled) {
	background-color: #c82333;
}

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

/* Modal styles matching PoolList.vue */
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
	width: 90%;
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

.form-group {
	margin-bottom: 1rem;
}

.form-group label {
	display: block;
	margin-bottom: 0.5rem;
	font-weight: 500;
	color: #2c3e50;
}

.required {
	color: #c62828;
}

.form-group input,
.form-group textarea,
.form-group select {
	width: 100%;
	padding: 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	font-size: 1rem;
	font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
	outline: none;
	border-color: #1976d2;
}

.modal-actions {
	display: flex;
	gap: 1rem;
	justify-content: flex-end;
	margin-top: 1.5rem;
}
</style>
