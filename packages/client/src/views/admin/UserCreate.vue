<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
	createUser,
	getMeetings,
	addUserToPool,
	getPools,
} from "../../services/api";
import { useAdminMeeting } from "../../composables/useAdminMeeting";
import type { Meeting, Pool } from "@mcdc-convention-voting/shared";

const router = useRouter();

// Constants
const EMPTY_STRING = "";
const EMPTY_ARRAY_LENGTH = 0;

// Validation patterns (consistent with CSV import validation)
// Voter ID: ASCII alphanumeric, hyphens, underscores (no spaces)
const VOTER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
// Names: ASCII letters, digits, spaces, hyphens, apostrophes
const NAME_PATTERN = /^[A-Za-z0-9\s'-]+$/;
// Username: ASCII alphanumeric, underscores (lowercase preferred)
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

// User role options
type UserRole = "voter" | "admin" | "watcher" | "meeting_admin";

// Meeting admin composable
const { currentMeeting, isJoined, joinedMeetingId } = useAdminMeeting();

const formData = ref({
	voterId: EMPTY_STRING,
	firstName: EMPTY_STRING,
	lastName: EMPTY_STRING,
	username: EMPTY_STRING,
	role: "voter" as UserRole,
	password: EMPTY_STRING,
	selectedMeetingAdminPoolId: null as number | null,
	selectedPoolIds: [] as number[],
});

const showPassword = ref(false);

const saving = ref(false);
const error = ref<string | null>(null);

// Meeting admin state
const meetings = ref<Meeting[]>([]);
const loadingMeetings = ref(false);

// Pool selection state
const pools = ref<Pool[]>([]);
const loadingPools = ref(false);

// Computed
const isMeetingAdmin = computed(
	(): boolean => formData.value.role === "meeting_admin",
);

// Determine quorum pool ID for the focused meeting
const focusedMeetingQuorumPoolId = computed(
	(): number | null => currentMeeting.value?.meeting.quorumVotingPoolId ?? null,
);

// Load meetings when role changes to meeting_admin
watch(
	() => formData.value.role,
	async (newRole) => {
		if (
			newRole === "meeting_admin" &&
			meetings.value.length === EMPTY_ARRAY_LENGTH
		) {
			await loadMeetings();
		}
	},
);

// Load pools when component mounts
onMounted(async () => {
	// Explicitly clear form to prevent browser autofill
	formData.value.username = EMPTY_STRING;
	formData.value.voterId = EMPTY_STRING;
	formData.value.firstName = EMPTY_STRING;
	formData.value.lastName = EMPTY_STRING;
	formData.value.password = EMPTY_STRING;

	await loadPools();
});

async function loadMeetings(): Promise<void> {
	loadingMeetings.value = true;
	try {
		const response = await getMeetings();
		meetings.value = response.data;
	} catch {
		// Ignore error - meetings list is optional
	} finally {
		loadingMeetings.value = false;
	}
}

async function loadPools(): Promise<void> {
	loadingPools.value = true;
	try {
		// If a meeting is focused, only load pools for that meeting
		const options =
			isJoined.value && joinedMeetingId.value !== null
				? { forMeetingId: joinedMeetingId.value, limit: 1000 }
				: { limit: 1000 };

		const response = await getPools(options);
		pools.value = response.data;

		// Auto-select the quorum pool for the focused meeting
		if (
			focusedMeetingQuorumPoolId.value !== null &&
			!formData.value.selectedPoolIds.includes(focusedMeetingQuorumPoolId.value)
		) {
			formData.value.selectedPoolIds = [
				...formData.value.selectedPoolIds,
				focusedMeetingQuorumPoolId.value,
			];
		}
	} catch {
		// Ignore error - pools list is optional
	} finally {
		loadingPools.value = false;
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

	// Validate username format (if provided)
	if (
		formData.value.username.trim() !== EMPTY_STRING &&
		!USERNAME_PATTERN.test(formData.value.username.trim())
	) {
		return "Username can only contain letters, numbers, and underscores.";
	}

	// Password is required for manual user creation
	if (formData.value.password.trim() === EMPTY_STRING) {
		return "Password is required.";
	}

	return null;
}

function getMeetingAdminPoolId(): number | null {
	if (
		formData.value.role === "meeting_admin" &&
		formData.value.selectedMeetingAdminPoolId !== null
	) {
		return formData.value.selectedMeetingAdminPoolId;
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
		const userData = {
			voterId: formData.value.voterId.trim(),
			firstName: formData.value.firstName.trim(),
			lastName: formData.value.lastName.trim(),
			password: formData.value.password,
			...(formData.value.username.trim() !== EMPTY_STRING && {
				username: formData.value.username.trim(),
			}),
			isAdmin: formData.value.role === "admin",
			isWatcher: formData.value.role === "watcher",
			isMeetingAdmin: formData.value.role === "meeting_admin",
		};

		const response = await createUser(userData);

		// If meeting admin and a meeting was selected, add user to meeting's admin pool
		const poolId = getMeetingAdminPoolId();
		if (poolId !== null) {
			await addUserToPool(poolId, response.data.id);
		}

		// Add user to all selected pools
		for (const selectedPoolId of formData.value.selectedPoolIds) {
			// Skip if already added as meeting admin pool
			if (selectedPoolId === poolId) {
				continue;
			}
			// eslint-disable-next-line no-await-in-loop -- Sequential pool assignment required to ensure proper error handling per pool
			await addUserToPool(selectedPoolId, response.data.id);
		}

		void router.push("/admin/users");
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to create user";
	} finally {
		saving.value = false;
	}
}

function cancel(): void {
	void router.push("/admin/users");
}
</script>

<template>
	<div class="user-create">
		<h2>Create New User</h2>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<form class="user-form" @submit.prevent="handleSubmit">
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
				<label for="username">
					Username
					<span class="optional"
						>(optional - will be auto-generated if not provided)</span
					>
				</label>
				<input
					id="username"
					v-model="formData.username"
					type="text"
					name="new-user-username"
					autocomplete="nope"
					readonly
					@focus="$event.target.removeAttribute('readonly')"
				/>
			</div>

			<div class="form-group">
				<label for="password"> Password <span class="required">*</span> </label>
				<div class="password-input-wrapper">
					<input
						id="password"
						v-model="formData.password"
						:type="showPassword ? 'text' : 'password'"
						required
					/>
					<button
						type="button"
						class="password-toggle"
						@click="showPassword = !showPassword"
					>
						{{ showPassword ? "Hide" : "Show" }}
					</button>
				</div>
				<p class="field-help">Set the initial password for this user.</p>
			</div>

			<div class="form-group">
				<label for="role"> Role <span class="required">*</span> </label>
				<select id="role" v-model="formData.role" required>
					<option value="voter">Voter</option>
					<option value="watcher">Watcher (Observer)</option>
					<option value="meeting_admin">Meeting Admin</option>
					<option value="admin">Global Admin</option>
				</select>
				<p class="role-description">
					<template v-if="formData.role === 'voter'">
						Voters can view open motions and cast votes.
					</template>
					<template v-else-if="formData.role === 'watcher'">
						Watchers have read-only access to meeting reports, quorum status,
						and completed motion results. They cannot vote.
					</template>
					<template v-else-if="formData.role === 'meeting_admin'">
						Meeting Admins can manage meetings they are assigned to (motions,
						quorum, reports). They must be added to a meeting's admin pool. They
						cannot vote.
					</template>
					<template v-else-if="formData.role === 'admin'">
						Global Admins can manage all users, meetings, motions, and system
						settings. They have access to all meetings. They cannot vote.
					</template>
				</p>
			</div>

			<!-- Pool selection (all user types) -->
			<div class="form-group">
				<label>
					Assign to Pools
					<span class="optional">(optional - can be assigned later)</span>
				</label>
				<div v-if="loadingPools" class="loading-state">Loading pools...</div>
				<div v-else-if="pools.length === 0" class="info-message">
					No pools available.
					<template v-if="isJoined">
						Create pools for this meeting first.
					</template>
				</div>
				<div v-else class="checkbox-group">
					<div
						v-for="pool in pools"
						:key="pool.id"
						class="checkbox-item"
						:class="{
							'is-quorum-pool': pool.id === focusedMeetingQuorumPoolId,
						}"
					>
						<input
							:id="`pool-${pool.id}`"
							v-model="formData.selectedPoolIds"
							type="checkbox"
							:value="pool.id"
							:disabled="pool.id === focusedMeetingQuorumPoolId"
						/>
						<label :for="`pool-${pool.id}`">
							{{ pool.name }}
							<span
								v-if="pool.id === focusedMeetingQuorumPoolId"
								class="auto-selected"
							>
								(auto-selected for focused meeting)
							</span>
							<span v-if="pool.description" class="pool-description">
								- {{ pool.description }}
							</span>
						</label>
					</div>
				</div>
				<p
					v-if="isJoined && focusedMeetingQuorumPoolId !== null"
					class="field-help"
				>
					The quorum pool for the focused meeting is automatically selected.
				</p>
			</div>

			<!-- Meeting selection for Meeting Admins (optional) -->
			<div v-if="isMeetingAdmin" class="form-group">
				<label for="meeting">
					Associate with Meeting <span class="optional">(optional)</span>
				</label>
				<select
					id="meeting"
					v-model="formData.selectedMeetingAdminPoolId"
					:disabled="loadingMeetings"
				>
					<option :value="null">-- None (assign later) --</option>
					<option
						v-for="meeting in meetings"
						:key="meeting.id"
						:value="meeting.meetingAdminPoolId"
					>
						{{ meeting.name }}
					</option>
				</select>
				<p class="field-help">
					You can assign this user to meetings later via the Pool management
					page.
				</p>
			</div>

			<div class="form-actions">
				<button type="submit" class="btn btn-primary" :disabled="saving">
					{{ saving ? "Creating..." : "Create User" }}
				</button>
				<button type="button" class="btn btn-secondary" @click="cancel">
					Cancel
				</button>
			</div>
		</form>
	</div>
</template>

<style scoped>
.user-create {
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

.role-description {
	margin-top: 0.5rem;
	font-size: 0.875rem;
	color: #666;
	font-style: italic;
}

.field-help {
	margin-top: 0.5rem;
	font-size: 0.875rem;
	color: #757575;
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

.loading-state {
	padding: 0.75rem;
	color: #757575;
	font-style: italic;
}

.info-message {
	padding: 0.75rem;
	background-color: #e3f2fd;
	color: #1565c0;
	border-radius: 4px;
	font-size: 0.875rem;
}

.checkbox-group {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.checkbox-item {
	display: flex;
	align-items: flex-start;
	gap: 0.5rem;
}

.checkbox-item.is-quorum-pool {
	background-color: #e8f5e9;
	padding: 0.5rem;
	border-radius: 4px;
	border: 1px solid #4caf50;
}

.checkbox-item input[type="checkbox"] {
	margin-top: 0.25rem;
	width: auto;
	cursor: pointer;
}

.checkbox-item input[type="checkbox"]:disabled {
	cursor: not-allowed;
}

.checkbox-item label {
	margin-bottom: 0;
	font-weight: 400;
	cursor: pointer;
	flex: 1;
}

.checkbox-item input[type="checkbox"]:disabled + label {
	cursor: not-allowed;
}

.auto-selected {
	font-size: 0.875rem;
	color: #2e7d32;
	font-weight: 500;
}

.pool-description {
	font-size: 0.875rem;
	color: #757575;
	font-style: italic;
}
</style>
