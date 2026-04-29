<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { createUser, getMeetings, addUserToPool } from "../../services/api";
import type { Meeting } from "@mcdc-convention-voting/shared";

const router = useRouter();

// Constants
const EMPTY_STRING = "";
const EMPTY_ARRAY_LENGTH = 0;

// User role options
type UserRole = "voter" | "admin" | "watcher" | "meeting_admin";

const formData = ref({
	voterId: EMPTY_STRING,
	firstName: EMPTY_STRING,
	lastName: EMPTY_STRING,
	username: EMPTY_STRING,
	role: "voter" as UserRole,
	password: EMPTY_STRING,
	selectedMeetingAdminPoolId: null as number | null,
});

const showPassword = ref(false);

const saving = ref(false);
const error = ref<string | null>(null);

// Meeting admin state
const meetings = ref<Meeting[]>([]);
const loadingMeetings = ref(false);

// Computed
const isMeetingAdmin = computed(
	(): boolean => formData.value.role === "meeting_admin",
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

function validateForm(): string | null {
	// Validate required fields
	if (
		formData.value.voterId.trim() === EMPTY_STRING ||
		formData.value.firstName.trim() === EMPTY_STRING ||
		formData.value.lastName.trim() === EMPTY_STRING
	) {
		return "Voter ID, First Name, and Last Name are required.";
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
				<input id="username" v-model="formData.username" type="text" />
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
</style>
