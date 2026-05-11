<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { PoolType, type User, type Pool } from "@mcdc-convention-voting/shared";
import {
	getUser,
	updateUser,
	getUserPools,
	getPools,
} from "../../services/api";
import { useAdminMeeting } from "../../composables/useAdminMeeting";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();

// Meeting context
const { isJoined, joinedMeetingId } = useAdminMeeting();

// Constants
const EMPTY_STRING = "";
const MAX_POOLS_TO_LOAD = 1000;
const FIRST_PAGE = 1;

// Validation patterns (consistent with CSV import validation)
// Voter ID: ASCII alphanumeric, hyphens, underscores (no spaces)
const VOTER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
// Names: ASCII letters, digits, spaces, hyphens, apostrophes
const NAME_PATTERN = /^[A-Za-z0-9\s'-]+$/;
// Username: ASCII alphanumeric, underscores (lowercase preferred)
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

const user = ref<User | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const formData = ref({
	voterId: EMPTY_STRING,
	firstName: EMPTY_STRING,
	lastName: EMPTY_STRING,
	username: EMPTY_STRING,
	password: EMPTY_STRING,
});

const showPassword = ref(false);

// Pool management
const userPools = ref<Pool[]>([]);
const allPools = ref<Pool[]>([]);
const selectedPoolIds = ref<Set<number>>(new Set());

/**
 * Filter pools to show only pools appropriate for the user's role:
 * - Voters: Only voter pools (pool_type = 'voter' or NULL)
 * - Meeting Admins: Only meeting admin pools (pool_type = 'meeting_admin')
 * - Watchers: Only watcher pools (pool_type = 'watcher')
 * - Global Admins: All pools (but meeting admins can't edit global admins)
 */
const filteredPools = computed((): Pool[] => {
	if (user.value === null) {
		return [];
	}

	// Global admins can be in any pool type
	if (user.value.isAdmin) {
		return allPools.value;
	}

	// Meeting admins can only be in meeting admin pools
	if (user.value.isMeetingAdmin) {
		return allPools.value.filter(
			(pool) => pool.poolType === PoolType.MeetingAdmin,
		);
	}

	// Watchers can only be in watcher pools
	if (user.value.isWatcher) {
		return allPools.value.filter((pool) => pool.poolType === PoolType.Watcher);
	}

	// Voters can be in voter pools or legacy/general-purpose pools (NULL type)
	return allPools.value.filter(
		(pool) => pool.poolType === PoolType.Voter || pool.poolType === null,
	);
});

async function loadUser(): Promise<void> {
	loading.value = true;
	error.value = null;

	try {
		const response = await getUser(props.id);
		if (response.data !== undefined) {
			const { data: userData } = response;
			user.value = userData;
			const { voterId, firstName, lastName, username } = userData;
			formData.value = {
				voterId: voterId ?? EMPTY_STRING,
				firstName,
				lastName,
				username,
				password: EMPTY_STRING,
			};
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load user";
	} finally {
		loading.value = false;
	}
}

async function loadUserPools(): Promise<void> {
	try {
		const response = await getUserPools(props.id);
		if (response.data !== undefined) {
			const { data } = response;
			userPools.value = data;
			selectedPoolIds.value = new Set(userPools.value.map((p) => p.id));
		}
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to load user pools";
	}
}

async function loadAllPools(): Promise<void> {
	try {
		// When a meeting is focused, only load pools for that meeting
		// This applies to both global admins and meeting admins to prevent
		// accidentally assigning users to wrong meeting's pools
		const options: {
			page: number;
			limit: number;
			forMeetingId?: number;
		} = {
			page: FIRST_PAGE,
			limit: MAX_POOLS_TO_LOAD,
		};

		if (isJoined.value && joinedMeetingId.value !== null) {
			options.forMeetingId = joinedMeetingId.value;
		}

		const response = await getPools(options);
		const { data } = response;
		allPools.value = data;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load pools";
	}
}

function togglePool(poolId: number): void {
	if (selectedPoolIds.value.has(poolId)) {
		selectedPoolIds.value.delete(poolId);
	} else {
		selectedPoolIds.value.add(poolId);
	}
}

function validateForm(): string | null {
	// Validate required fields
	if (
		formData.value.voterId.trim() === EMPTY_STRING ||
		formData.value.firstName.trim() === EMPTY_STRING ||
		formData.value.lastName.trim() === EMPTY_STRING
	) {
		return "Voter ID, First Name, and Last Name are required.";
	}

	// Validate voter ID format
	if (!VOTER_ID_PATTERN.test(formData.value.voterId.trim())) {
		return "Voter ID can only contain letters, numbers, hyphens, and underscores.";
	}

	// Validate first name format
	if (!NAME_PATTERN.test(formData.value.firstName.trim())) {
		return "First Name can only contain letters, numbers, spaces, hyphens, and apostrophes.";
	}

	// Validate last name format
	if (!NAME_PATTERN.test(formData.value.lastName.trim())) {
		return "Last Name can only contain letters, numbers, spaces, hyphens, and apostrophes.";
	}

	// Validate username format
	if (
		formData.value.username.trim() !== EMPTY_STRING &&
		!USERNAME_PATTERN.test(formData.value.username.trim())
	) {
		return "Username can only contain letters, numbers, and underscores.";
	}

	return null;
}

async function handleSubmit(): Promise<void> {
	error.value = null;

	const validationError = validateForm();
	if (validationError !== null) {
		error.value = validationError;
		return;
	}

	saving.value = true;

	try {
		// Get pool keys from selected pool IDs
		const selectedPools = allPools.value.filter((p) =>
			selectedPoolIds.value.has(p.id),
		);
		const poolKeys = selectedPools.map((p) => p.poolKey);

		const userData = {
			voterId: formData.value.voterId.trim(),
			firstName: formData.value.firstName.trim(),
			lastName: formData.value.lastName.trim(),
			username: formData.value.username.trim(),
			poolKeys,
			...(formData.value.password.trim() !== EMPTY_STRING && {
				password: formData.value.password,
			}),
		};

		await updateUser(props.id, userData);
		void router.push("/admin/users");
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to update user";
	} finally {
		saving.value = false;
	}
}

function cancel(): void {
	void router.push("/admin/users");
}

onMounted(() => {
	void loadUser();
	void loadUserPools();
	void loadAllPools();
});
</script>

<template>
	<div class="user-edit">
		<h2>Edit User</h2>

		<div v-if="loading" class="loading">Loading user...</div>

		<div v-if="error && !loading" class="error">
			{{ error }}
		</div>

		<form
			v-if="!loading && user"
			class="user-form"
			@submit.prevent="handleSubmit"
		>
			<div class="form-group">
				<label for="voterId"> Voter ID <span class="required">*</span> </label>
				<input id="voterId" v-model="formData.voterId" type="text" required />
			</div>

			<div class="form-group">
				<label for="firstName">
					First Name <span class="required">*</span>
				</label>
				<input
					id="firstName"
					v-model="formData.firstName"
					type="text"
					required
				/>
			</div>

			<div class="form-group">
				<label for="lastName">
					Last Name <span class="required">*</span>
				</label>
				<input id="lastName" v-model="formData.lastName" type="text" required />
			</div>

			<div class="form-group">
				<label for="username"> Username <span class="required">*</span> </label>
				<input id="username" v-model="formData.username" type="text" required />
			</div>

			<div class="form-group">
				<label for="password">
					New Password
					<span class="optional">(leave blank to keep current)</span>
				</label>
				<div class="password-input-wrapper">
					<input
						id="password"
						v-model="formData.password"
						:type="showPassword ? 'text' : 'password'"
						placeholder="Enter new password to change"
					/>
					<button
						type="button"
						class="password-toggle"
						@click="showPassword = !showPassword"
					>
						{{ showPassword ? "Hide" : "Show" }}
					</button>
				</div>
			</div>

			<div class="user-info">
				<p>
					<strong>Status:</strong> {{ user.isDisabled ? "Disabled" : "Active" }}
				</p>
				<p>
					<strong>User Role:</strong>
					{{
						user.isAdmin
							? "Global Admin"
							: user.isMeetingAdmin
								? "Meeting Admin"
								: user.isWatcher
									? "Watcher"
									: "Voter"
					}}
				</p>
				<p>
					<strong>Created:</strong>
					{{ new Date(user.createdAt).toLocaleString() }}
				</p>
			</div>

			<div class="form-section">
				<h3>Pool Assignments</h3>
				<p class="section-description">
					Select which pools this user belongs to
					<template v-if="isJoined">
						(filtered by user role and focused meeting)
					</template>
					<template v-else> (filtered by user role) </template>:
				</p>
				<div v-if="filteredPools.length === 0" class="no-pools">
					No pools available for this user role<template v-if="isJoined">
						in the focused meeting</template
					>. Create appropriate pools first.
				</div>
				<div v-else class="pool-checkboxes">
					<label
						v-for="pool in filteredPools"
						:key="pool.id"
						class="pool-checkbox-label"
					>
						<input
							type="checkbox"
							:checked="selectedPoolIds.has(pool.id)"
							@change="togglePool(pool.id)"
						/>
						<span class="pool-checkbox-text">
							<strong>{{ pool.poolName }}</strong>
							<span class="pool-key">({{ pool.poolKey }})</span>
						</span>
					</label>
				</div>
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
	</div>
</template>

<style scoped>
.user-edit {
	max-width: 600px;
}

h2 {
	margin-bottom: 1.5rem;
	color: #2c3e50;
}

.loading {
	padding: 1rem;
	background-color: #e3f2fd;
	color: #1976d2;
	border-radius: 4px;
}

.error {
	padding: 1rem;
	margin-bottom: 1rem;
	background-color: #ffebee;
	color: #c62828;
	border-radius: 4px;
}

.user-form {
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
.form-group select {
	width: 100%;
	padding: 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	font-size: 1rem;
}

.form-group input:focus,
.form-group select:focus {
	outline: none;
	border-color: #1976d2;
}

.password-input-wrapper {
	display: flex;
	gap: 0.5rem;
}

.password-input-wrapper input {
	flex: 1;
}

.password-toggle {
	padding: 0.75rem 1rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	background-color: #f5f5f5;
	color: #2c3e50;
	font-size: 0.875rem;
	cursor: pointer;
	transition: background-color 0.2s;
	white-space: nowrap;
}

.password-toggle:hover {
	background-color: #e0e0e0;
}

.user-info {
	margin: 1.5rem 0;
	padding: 1rem;
	background-color: #f5f5f5;
	border-radius: 4px;
}

.user-info p {
	margin: 0.5rem 0;
	color: #616161;
}

.form-section {
	margin: 2rem 0;
	padding-top: 1.5rem;
	border-top: 1px solid #e0e0e0;
}

.form-section h3 {
	margin: 0 0 0.5rem 0;
	color: #2c3e50;
	font-size: 1.125rem;
}

.section-description {
	margin: 0 0 1rem 0;
	color: #757575;
	font-size: 0.875rem;
}

.no-pools {
	padding: 1rem;
	background-color: #f5f5f5;
	border-radius: 4px;
	color: #757575;
	text-align: center;
}

.pool-checkboxes {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	gap: 0.75rem;
}

.pool-checkbox-label {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	cursor: pointer;
	transition: all 0.2s;
}

.pool-checkbox-label:hover {
	background-color: #f8f9fa;
	border-color: #1976d2;
}

.pool-checkbox-label input[type="checkbox"] {
	width: auto;
	cursor: pointer;
}

.pool-checkbox-text {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.pool-key {
	font-size: 0.875rem;
	color: #757575;
	font-family: monospace;
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
</style>
