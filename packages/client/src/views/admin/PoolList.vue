<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import { getPools, disablePool, enablePool } from "../../services/api";
import TablePagination from "../../components/TablePagination.vue";
import type { Pool } from "@mcdc-convention-voting/shared";

const router = useRouter();

const POOLS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;

const pools = ref<Pool[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalPools = ref(INITIAL_TOTAL);

// Filter state
const showOnlyQuorumPools = ref(false);
const showDisabledPools = ref(false);

const totalPages = computed(() => Math.ceil(totalPools.value / POOLS_PER_PAGE));

// Modal state for disable
const showDisableModal = ref(false);
const poolToDisable = ref<number | null>(null);

// Modal state for enable
const showEnableModal = ref(false);
const poolToEnable = ref<number | null>(null);

// Scroll shadow indicator state
const scrollWrapper = ref<HTMLElement | null>(null);
const canScrollRight = ref(false);

async function loadPools(): Promise<void> {
	loading.value = true;
	error.value = null;

	try {
		const response = await getPools({
			page: currentPage.value,
			limit: POOLS_PER_PAGE,
			includeDisabled: showDisabledPools.value,
			onlyQuorumPools: showOnlyQuorumPools.value,
		});
		const { data, pagination } = response;
		pools.value = data;
		totalPools.value = pagination.total;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load pools";
	} finally {
		loading.value = false;
	}
}

function handleFilterChange(): void {
	currentPage.value = INITIAL_PAGE;
	void loadPools();
}

function editPool(poolId: number): void {
	void router.push(`/admin/pools/${poolId}/edit`);
}

function viewPoolUsers(poolId: number): void {
	void router.push(`/admin/pools/${poolId}/users`);
}

function requestDisable(poolId: number): void {
	poolToDisable.value = poolId;
	showDisableModal.value = true;
}

function cancelDisable(): void {
	showDisableModal.value = false;
	poolToDisable.value = null;
}

async function handleDisable(): Promise<void> {
	if (poolToDisable.value === null) {
		return;
	}

	showDisableModal.value = false;
	const { value: poolId } = poolToDisable;
	poolToDisable.value = null;

	try {
		await disablePool(poolId);
		await loadPools();
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to disable pool";
	}
}

function requestEnable(poolId: number): void {
	poolToEnable.value = poolId;
	showEnableModal.value = true;
}

function cancelEnable(): void {
	showEnableModal.value = false;
	poolToEnable.value = null;
}

async function handleEnable(): Promise<void> {
	if (poolToEnable.value === null) {
		return;
	}

	showEnableModal.value = false;
	const { value: poolId } = poolToEnable;
	poolToEnable.value = null;

	try {
		await enablePool(poolId);
		await loadPools();
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to enable pool";
	}
}

function goToPage(page: number): void {
	currentPage.value = page;
	void loadPools();
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
	void loadPools();

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

// Update scroll shadow when pools change
watch(pools, () => {
	void nextTick(() => {
		updateScrollShadow();
	});
});
</script>

<template>
	<div class="pool-list">
		<div class="header">
			<h2>Pools</h2>
			<div class="actions">
				<router-link to="/admin/pools/create" class="btn btn-primary">
					Create Pool
				</router-link>
				<router-link to="/admin/pools/upload" class="btn btn-secondary">
					Upload CSV
				</router-link>
			</div>
		</div>

		<div class="filters">
			<label class="filter-checkbox">
				<input
					v-model="showOnlyQuorumPools"
					type="checkbox"
					@change="handleFilterChange"
				/>
				Show only quorum pools
			</label>
			<label class="filter-checkbox">
				<input
					v-model="showDisabledPools"
					type="checkbox"
					@change="handleFilterChange"
				/>
				Show disabled pools
			</label>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading pools...</div>

		<div v-else-if="pools.length === 0" class="empty">
			No pools found. Create a pool or upload a CSV to get started.
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
					<table class="pools-table">
						<thead>
							<tr>
								<th>Pool Key</th>
								<th>Pool Name</th>
								<th>Description</th>
								<th>Users</th>
								<th>Quorum Pool</th>
								<th>Status</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="pool in pools" :key="pool.id">
								<td class="pool-key">
									{{ pool.poolKey }}
								</td>
								<td>{{ pool.poolName }}</td>
								<td class="description">
									{{ pool.description || "—" }}
								</td>
								<td class="user-count">
									{{ pool.userCount }}
								</td>
								<td class="quorum-indicator">
									<span v-if="pool.isQuorumPool" class="quorum-badge">
										Yes
									</span>
									<span v-else>—</span>
								</td>
								<td>
									<span
										class="status-badge"
										:class="{ disabled: pool.isDisabled }"
									>
										{{ pool.isDisabled ? "Disabled" : "Active" }}
									</span>
								</td>
								<td class="actions-cell">
									<button class="btn btn-small" @click="editPool(pool.id)">
										Edit
									</button>
									<button class="btn btn-small" @click="viewPoolUsers(pool.id)">
										View Users
									</button>
									<button
										v-if="!pool.isDisabled"
										class="btn btn-small btn-warning"
										@click="requestDisable(pool.id)"
									>
										Disable
									</button>
									<button
										v-else
										class="btn btn-small btn-success"
										@click="requestEnable(pool.id)"
									>
										Enable
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
				:total-items="totalPools"
				@page-change="goToPage"
			/>
		</div>

		<!-- Disable Confirmation Modal -->
		<div v-if="showDisableModal" class="modal" @click="cancelDisable">
			<div class="modal-content" @click.stop>
				<h3>Confirm Disable Pool</h3>
				<p>
					Are you sure you want to disable this pool? Users will still be
					associated with it but it will be marked as disabled.
				</p>
				<div class="modal-actions">
					<button class="btn btn-warning" @click="handleDisable">
						Yes, Disable Pool
					</button>
					<button class="btn btn-secondary" @click="cancelDisable">
						Cancel
					</button>
				</div>
			</div>
		</div>

		<!-- Enable Confirmation Modal -->
		<div v-if="showEnableModal" class="modal" @click="cancelEnable">
			<div class="modal-content" @click.stop>
				<h3>Confirm Enable Pool</h3>
				<p>Are you sure you want to enable this pool?</p>
				<div class="modal-actions">
					<button class="btn btn-success" @click="handleEnable">
						Yes, Enable Pool
					</button>
					<button class="btn btn-secondary" @click="cancelEnable">
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.pool-list {
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

.filters {
	display: flex;
	gap: 2rem;
	margin-bottom: 1rem;
	padding: 1rem;
	background-color: white;
	border-radius: 8px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.filter-checkbox {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	cursor: pointer;
	font-size: 0.9375rem;
	color: #2c3e50;
}

.filter-checkbox input[type="checkbox"] {
	width: 1rem;
	height: 1rem;
	cursor: pointer;
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

.pools-table {
	width: 100%;
	min-width: 800px;
	border-collapse: collapse;
}

.pools-table th {
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

.pools-table td {
	padding: 1rem;
	border-bottom: 1px solid #dee2e6;
}

.pools-table tbody tr:hover {
	background-color: #f8f9fa;
}

.pool-key {
	font-family: monospace;
	color: #0066cc;
	font-weight: 500;
}

.description {
	max-width: 300px;
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
	background-color: #d4edda;
	color: #155724;
}

.status-badge.disabled {
	background-color: #f8d7da;
	color: #721c24;
}

.quorum-indicator {
	text-align: center;
}

.quorum-badge {
	display: inline-block;
	padding: 0.25rem 0.75rem;
	border-radius: 12px;
	font-size: 0.875rem;
	font-weight: 500;
	background-color: #cce5ff;
	color: #004085;
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

.btn-warning {
	background-color: #ffc107;
	color: #000;
}

.btn-warning:hover {
	background-color: #e0a800;
}

.btn-success {
	background-color: #28a745;
	color: white;
}

.btn-success:hover {
	background-color: #218838;
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
