<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { PoolType } from "@mcdc-convention-voting/shared";
import {
	getMeeting,
	updateMeeting,
	getPools,
	getMeetingVoterPools,
	updateMeetingVoterPools,
	createPool,
} from "../../services/api";
import { useAuth } from "../../composables/useAuth";
import type { Pool } from "@mcdc-convention-voting/shared";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();
const { isAdmin } = useAuth();

// Constants
const EMPTY_STRING = "";
const ALL_POOLS_LIMIT = 1000;
const INITIAL_PAGE = 1;
const DECIMAL_RADIX = 10;
const MONTH_OFFSET = 1;
const PAD_LENGTH = 2;
const PAD_CHAR = "0";

const pools = ref<Pool[]>([]);
const loadingPools = ref(false);

// Pools eligible for quorum voting (voter type or legacy null type)
const quorumEligiblePools = computed(() =>
	pools.value.filter(
		(pool) => pool.poolType === null || pool.poolType === PoolType.Voter,
	),
);

// Pools eligible as voter pools (same criteria as quorum pools)
const voterEligiblePools = computed(() =>
	pools.value.filter(
		(pool) => pool.poolType === null || pool.poolType === PoolType.Voter,
	),
);

// Pools eligible as watcher pools (watcher type only)
const watcherEligiblePools = computed(() =>
	pools.value.filter((pool) => pool.poolType === PoolType.Watcher),
);

// Pools eligible as meeting admin pools (meeting_admin type only)
const meetingAdminEligiblePools = computed(() =>
	pools.value.filter((pool) => pool.poolType === PoolType.MeetingAdmin),
);

const formData = ref({
	name: EMPTY_STRING,
	description: EMPTY_STRING,
	startDate: EMPTY_STRING,
	endDate: EMPTY_STRING,
	quorumVotingPoolId: EMPTY_STRING,
	watcherPoolId: EMPTY_STRING,
	meetingAdminPoolId: EMPTY_STRING,
});

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

// Voter pools state
const selectedVoterPoolIds = ref<Set<number>>(new Set());
const loadingVoterPools = ref(false);

// Create pool modal state
const showCreatePoolModal = ref(false);
const createPoolName = ref(EMPTY_STRING);
const createPoolKey = ref(EMPTY_STRING);
const createPoolDescription = ref(EMPTY_STRING);
const createPoolLoading = ref(false);

// Check if a pool is the quorum pool (always checked/disabled)
const isQuorumPool = computed(() => (poolId: number): boolean => {
	const quorumId = Number.parseInt(
		formData.value.quorumVotingPoolId,
		DECIMAL_RADIX,
	);
	return !Number.isNaN(quorumId) && poolId === quorumId;
});

// Sync quorum pool changes to selectedVoterPoolIds
watch(
	() => formData.value.quorumVotingPoolId,
	(newQuorumPoolId) => {
		const newId = Number.parseInt(newQuorumPoolId, DECIMAL_RADIX);
		if (!Number.isNaN(newId)) {
			selectedVoterPoolIds.value.add(newId);
			selectedVoterPoolIds.value = new Set(selectedVoterPoolIds.value);
		}
	},
);

function formatDateForInput(date: Date | string): string {
	const d = new Date(date);
	// Format as YYYY-MM-DDTHH:mm for datetime-local input
	const year = d.getFullYear();
	const month = String(d.getMonth() + MONTH_OFFSET).padStart(
		PAD_LENGTH,
		PAD_CHAR,
	);
	const day = String(d.getDate()).padStart(PAD_LENGTH, PAD_CHAR);
	const hours = String(d.getHours()).padStart(PAD_LENGTH, PAD_CHAR);
	const minutes = String(d.getMinutes()).padStart(PAD_LENGTH, PAD_CHAR);
	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function loadPools(): Promise<void> {
	loadingPools.value = true;
	try {
		// includeDisabled defaults to false, so disabled pools are filtered out
		const response = await getPools({
			page: INITIAL_PAGE,
			limit: ALL_POOLS_LIMIT,
		});
		pools.value = response.data;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load pools";
	} finally {
		loadingPools.value = false;
	}
}

async function loadMeeting(): Promise<void> {
	loading.value = true;
	error.value = null;

	const meetingId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(meetingId)) {
		error.value = "Invalid meeting ID";
		loading.value = false;
		return;
	}

	try {
		const response = await getMeeting(meetingId);
		if (response.data !== undefined) {
			const { data: meeting } = response;
			formData.value = {
				name: meeting.name,
				description: meeting.description ?? EMPTY_STRING,
				startDate: formatDateForInput(meeting.startDate),
				endDate: formatDateForInput(meeting.endDate),
				quorumVotingPoolId: String(meeting.quorumVotingPoolId),
				watcherPoolId:
					meeting.watcherPoolId === null
						? EMPTY_STRING
						: String(meeting.watcherPoolId),
				meetingAdminPoolId:
					meeting.meetingAdminPoolId === null
						? EMPTY_STRING
						: String(meeting.meetingAdminPoolId),
			};
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load meeting";
	} finally {
		loading.value = false;
	}
}

async function loadVoterPools(): Promise<void> {
	const meetingId = Number.parseInt(props.id, DECIMAL_RADIX);
	if (Number.isNaN(meetingId)) return;

	loadingVoterPools.value = true;
	try {
		const response = await getMeetingVoterPools(meetingId);
		if (response.data !== undefined) {
			selectedVoterPoolIds.value = new Set(response.data);
		}
	} catch {
		// Non-critical: voter pools section can still work
		// Error is ignored as this is a secondary data load
	} finally {
		loadingVoterPools.value = false;
	}
}

function toggleVoterPool(poolId: number): void {
	// Cannot toggle the quorum pool - it's always checked
	if (isQuorumPool.value(poolId)) return;

	if (selectedVoterPoolIds.value.has(poolId)) {
		selectedVoterPoolIds.value.delete(poolId);
	} else {
		selectedVoterPoolIds.value.add(poolId);
	}
	// Force reactivity
	selectedVoterPoolIds.value = new Set(selectedVoterPoolIds.value);
}

/**
 * Generate a pool key from meeting name (client-side)
 * Matches the backend pattern: slugify + suffix
 */
function generatePoolKeyFromName(name: string, suffix = "pool"): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(?:^-|-$)/g, "");
	return `${slug}-${suffix}`;
}

function openCreatePoolModal(): void {
	const meetingName = formData.value.name;
	const suggestedKey = generatePoolKeyFromName(meetingName, "voters");

	createPoolKey.value = suggestedKey;
	createPoolName.value = `${meetingName} - Additional Voters`;
	createPoolDescription.value = EMPTY_STRING;
	showCreatePoolModal.value = true;
}

function closeCreatePoolModal(): void {
	showCreatePoolModal.value = false;
	createPoolKey.value = EMPTY_STRING;
	createPoolName.value = EMPTY_STRING;
	createPoolDescription.value = EMPTY_STRING;
}

async function handleCreatePool(): Promise<void> {
	if (createPoolName.value.trim() === EMPTY_STRING) {
		error.value = "Pool name is required";
		return;
	}
	if (createPoolKey.value.trim() === EMPTY_STRING) {
		error.value = "Pool key is required";
		return;
	}

	createPoolLoading.value = true;
	error.value = null;

	try {
		const trimmedDescription = createPoolDescription.value.trim();
		const result = await createPool({
			poolKey: createPoolKey.value.trim(),
			poolName: createPoolName.value.trim(),
			description:
				trimmedDescription === EMPTY_STRING ? undefined : trimmedDescription,
		});

		if (result.data !== undefined) {
			// Refresh pools list
			await loadPools();

			// Auto-check the new pool
			selectedVoterPoolIds.value.add(result.data.id);
			selectedVoterPoolIds.value = new Set(selectedVoterPoolIds.value);
		}

		closeCreatePoolModal();
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to create pool";
	} finally {
		createPoolLoading.value = false;
	}
}

interface FormDataType {
	name: string;
	description: string;
	startDate: string;
	endDate: string;
	quorumVotingPoolId: string;
	watcherPoolId: string;
	meetingAdminPoolId: string;
}

function validateFormData(data: FormDataType): string | null {
	if (data.name.trim() === EMPTY_STRING) {
		return "Name is required.";
	}
	if (data.startDate === EMPTY_STRING) {
		return "Start date is required.";
	}
	if (data.endDate === EMPTY_STRING) {
		return "End date is required.";
	}
	if (data.quorumVotingPoolId === EMPTY_STRING) {
		return "Quorum voting pool is required.";
	}
	const startDate = new Date(data.startDate);
	const endDate = new Date(data.endDate);
	if (endDate <= startDate) {
		return "End date must be after start date.";
	}
	return null;
}

async function handleSubmit(): Promise<void> {
	error.value = null;

	const validationError = validateFormData(formData.value);
	if (validationError !== null) {
		error.value = validationError;
		return;
	}

	const startDate = new Date(formData.value.startDate);
	const endDate = new Date(formData.value.endDate);

	saving.value = true;

	try {
		const meetingId = Number.parseInt(props.id, DECIMAL_RADIX);
		const trimmedDescription = formData.value.description.trim();
		const meetingData = {
			name: formData.value.name.trim(),
			startDate: startDate.toISOString(),
			endDate: endDate.toISOString(),
			quorumVotingPoolId: Number.parseInt(
				formData.value.quorumVotingPoolId,
				DECIMAL_RADIX,
			),
			description:
				trimmedDescription === EMPTY_STRING ? undefined : trimmedDescription,
			watcherPoolId:
				formData.value.watcherPoolId === EMPTY_STRING
					? null
					: Number.parseInt(formData.value.watcherPoolId, DECIMAL_RADIX),
			meetingAdminPoolId:
				formData.value.meetingAdminPoolId === EMPTY_STRING
					? null
					: Number.parseInt(formData.value.meetingAdminPoolId, DECIMAL_RADIX),
		};

		await updateMeeting(meetingId, meetingData);

		// Save voter pools (quorum pool automatically included by backend)
		await updateMeetingVoterPools(
			meetingId,
			Array.from(selectedVoterPoolIds.value),
		);

		void router.push("/admin/meetings");
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to update meeting";
	} finally {
		saving.value = false;
	}
}

function cancel(): void {
	void router.push("/admin/meetings");
}

onMounted(() => {
	void loadPools();
	void loadMeeting();
	void loadVoterPools();
});
</script>

<template>
	<div class="meeting-edit">
		<h2>Edit Meeting</h2>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading meeting...</div>

		<form v-else class="meeting-form" @submit.prevent="handleSubmit">
			<div class="form-group">
				<label for="name"> Name <span class="required">*</span> </label>
				<input id="name" v-model="formData.name" type="text" required />
			</div>

			<div class="form-group">
				<label for="description">
					Description
					<span class="optional">(optional)</span>
				</label>
				<textarea id="description" v-model="formData.description" rows="3" />
			</div>

			<div class="form-group">
				<label for="startDate">
					Start Date <span class="required">*</span>
				</label>
				<input
					id="startDate"
					v-model="formData.startDate"
					type="datetime-local"
					required
				/>
			</div>

			<div class="form-group">
				<label for="endDate"> End Date <span class="required">*</span> </label>
				<input
					id="endDate"
					v-model="formData.endDate"
					type="datetime-local"
					required
				/>
			</div>

			<div class="form-group">
				<label for="quorumVotingPoolId">
					Quorum Voting Pool <span class="required">*</span>
				</label>
				<select
					id="quorumVotingPoolId"
					v-model="formData.quorumVotingPoolId"
					required
					:disabled="loadingPools"
				>
					<option value="">
						{{ loadingPools ? "Loading pools..." : "Select a pool" }}
					</option>
					<option
						v-for="pool in quorumEligiblePools"
						:key="pool.id"
						:value="pool.id"
					>
						{{ pool.poolName }}
					</option>
				</select>
				<p class="field-description">
					Only pools with "Voter" type or unspecified type can be used as quorum
					pools.
				</p>
			</div>

			<div class="form-group">
				<label for="watcherPoolId">
					Watcher Pool
					<span class="optional">(optional)</span>
				</label>
				<select
					id="watcherPoolId"
					v-model="formData.watcherPoolId"
					:disabled="loadingPools"
				>
					<option value="">
						{{ loadingPools ? "Loading pools..." : "No watcher pool" }}
					</option>
					<option
						v-for="pool in watcherEligiblePools"
						:key="pool.id"
						:value="pool.id"
					>
						{{ pool.poolName }}
					</option>
				</select>
				<p class="field-description">
					Optional pool of users who can observe this meeting as watchers. Only
					pools with "Watcher" type are shown.
				</p>
			</div>

			<div class="form-group">
				<label for="meetingAdminPoolId">
					Meeting Admin Pool
					<span class="optional">(optional)</span>
				</label>
				<select
					id="meetingAdminPoolId"
					v-model="formData.meetingAdminPoolId"
					:disabled="loadingPools || !isAdmin"
				>
					<option value="">
						{{ loadingPools ? "Loading pools..." : "No admin pool" }}
					</option>
					<option
						v-for="pool in meetingAdminEligiblePools"
						:key="pool.id"
						:value="pool.id"
					>
						{{ pool.poolName }}
					</option>
				</select>
				<p class="field-description">
					Optional pool of users who can administer this meeting (global admins
					always have access). Only pools with "Meeting Admin" type are shown.
				</p>
				<p v-if="!isAdmin" class="field-restriction">
					Only global administrators can change the Meeting Admin Pool.
				</p>
			</div>

			<div class="form-group">
				<label>
					Voter Pools
					<span class="optional">(voters from these pools can vote)</span>
				</label>
				<p class="field-description">
					Select which pools can vote in this meeting. Only pools with "Voter"
					type or unspecified type are shown. The quorum pool is always
					included.
				</p>

				<div v-if="loadingPools || loadingVoterPools" class="loading-inline">
					Loading pools...
				</div>

				<div v-else class="voter-pools-grid">
					<label
						v-for="pool in voterEligiblePools"
						:key="pool.id"
						class="pool-checkbox"
						:class="{ 'pool-checkbox-disabled': isQuorumPool(pool.id) }"
					>
						<input
							type="checkbox"
							:checked="
								selectedVoterPoolIds.has(pool.id) || isQuorumPool(pool.id)
							"
							:disabled="isQuorumPool(pool.id)"
							@change="toggleVoterPool(pool.id)"
						/>
						<span class="pool-name">{{ pool.poolName }}</span>
						<span v-if="isQuorumPool(pool.id)" class="quorum-badge"
							>(Quorum Pool)</span
						>
					</label>
				</div>

				<button
					type="button"
					class="btn btn-small btn-outline"
					@click="openCreatePoolModal"
				>
					+ Create New Pool
				</button>
			</div>

			<div class="form-actions">
				<button type="submit" class="btn btn-primary" :disabled="saving">
					{{ saving ? "Saving..." : "Save Changes" }}
				</button>
				<button type="button" class="btn btn-secondary" @click="cancel">
					Cancel
				</button>
			</div>
		</form>

		<!-- Create Pool Modal -->
		<div v-if="showCreatePoolModal" class="modal" @click="closeCreatePoolModal">
			<div class="modal-content" @click.stop>
				<h3>Create New Pool</h3>
				<p>Create a new voter pool for this meeting.</p>

				<div class="form-group">
					<label for="newPoolName">
						Pool Name <span class="required">*</span>
					</label>
					<input
						id="newPoolName"
						v-model="createPoolName"
						type="text"
						placeholder="Display name for the pool"
					/>
				</div>

				<div class="form-group">
					<label for="newPoolKey">
						Pool Key <span class="required">*</span>
					</label>
					<input
						id="newPoolKey"
						v-model="createPoolKey"
						type="text"
						placeholder="Unique identifier (auto-generated)"
					/>
					<p class="field-description">
						Unique identifier used for CSV imports and API references
					</p>
				</div>

				<div class="form-group">
					<label for="newPoolDescription">Description</label>
					<textarea
						id="newPoolDescription"
						v-model="createPoolDescription"
						rows="2"
						placeholder="Optional description"
					/>
				</div>

				<div class="modal-actions">
					<button
						class="btn btn-primary"
						:disabled="createPoolLoading"
						@click="handleCreatePool"
					>
						{{ createPoolLoading ? "Creating..." : "Create Pool" }}
					</button>
					<button class="btn btn-secondary" @click="closeCreatePoolModal">
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.meeting-edit {
	max-width: 600px;
}

h2 {
	margin-bottom: 1.5rem;
	color: #2c3e50;
}

.error {
	padding: 1rem;
	margin-bottom: 1rem;
	background-color: #ffebee;
	color: #c62828;
	border-radius: 4px;
}

.loading {
	text-align: center;
	padding: 2rem;
	color: #666;
}

.meeting-form {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.form-group {
	margin-bottom: 1.5rem;
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

.optional {
	font-size: 0.875rem;
	font-weight: 400;
	color: #757575;
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

.form-actions {
	display: flex;
	gap: 1rem;
	margin-top: 2rem;
}

.btn {
	padding: 0.75rem 1.5rem;
	border: none;
	border-radius: 4px;
	font-size: 1rem;
	cursor: pointer;
	transition: background-color 0.2s;
}

.btn:disabled {
	background-color: #bdbdbd;
	cursor: not-allowed;
}

.btn-primary {
	background-color: #1976d2;
	color: white;
}

.btn-primary:hover:not(:disabled) {
	background-color: #1565c0;
}

.btn-secondary {
	background-color: #757575;
	color: white;
}

.btn-secondary:hover:not(:disabled) {
	background-color: #616161;
}

.field-description {
	margin: 0.5rem 0 0 0;
	font-size: 0.875rem;
	color: #666;
}

.field-restriction {
	margin: 0.5rem 0 0 0;
	font-size: 0.875rem;
	color: #e65100;
	font-style: italic;
}

/* Voter pools grid */
.voter-pools-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 0.75rem;
	margin-bottom: 1rem;
	padding: 1rem;
	background-color: #f8f9fa;
	border-radius: 4px;
	max-height: 300px;
	overflow-y: auto;
}

.pool-checkbox {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem;
	background-color: white;
	border-radius: 4px;
	cursor: pointer;
	border: 1px solid #e0e0e0;
	transition: border-color 0.2s;
}

.pool-checkbox:hover:not(.pool-checkbox-disabled) {
	border-color: #1976d2;
}

.pool-checkbox-disabled {
	background-color: #e3f2fd;
	cursor: not-allowed;
}

.pool-checkbox input[type="checkbox"] {
	width: auto;
	margin: 0;
}

.pool-name {
	flex: 1;
	font-size: 0.875rem;
}

.quorum-badge {
	font-size: 0.75rem;
	color: #1976d2;
	font-weight: 500;
}

.btn-small {
	padding: 0.5rem 1rem;
	font-size: 0.875rem;
}

.btn-outline {
	background-color: transparent;
	border: 1px solid #1976d2;
	color: #1976d2;
}

.btn-outline:hover {
	background-color: #e3f2fd;
}

.loading-inline {
	padding: 1rem;
	color: #666;
	text-align: center;
}

/* Modal styles */
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

.modal-content > p {
	margin: 0 0 1.5rem 0;
	color: #666;
	line-height: 1.5;
}

.modal-actions {
	display: flex;
	gap: 1rem;
	justify-content: flex-end;
	margin-top: 1.5rem;
}
</style>
