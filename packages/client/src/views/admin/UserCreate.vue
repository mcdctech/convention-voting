<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { createUser } from "../../services/api";

const router = useRouter();

// Constants
const EMPTY_STRING = "";

// User role options
type UserRole = "voter" | "admin" | "watcher";

const formData = ref({
	voterId: EMPTY_STRING,
	firstName: EMPTY_STRING,
	lastName: EMPTY_STRING,
	username: EMPTY_STRING,
	role: "voter" as UserRole,
});

const saving = ref(false);
const error = ref<string | null>(null);

async function handleSubmit(): Promise<void> {
	error.value = null;

	if (
		formData.value.voterId.trim() === EMPTY_STRING ||
		formData.value.firstName.trim() === EMPTY_STRING ||
		formData.value.lastName.trim() === EMPTY_STRING
	) {
		error.value = "Voter ID, First Name, and Last Name are required.";
		return;
	}

	saving.value = true;

	try {
		const userData = {
			voterId: formData.value.voterId.trim(),
			firstName: formData.value.firstName.trim(),
			lastName: formData.value.lastName.trim(),
			...(formData.value.username.trim() !== EMPTY_STRING && {
				username: formData.value.username.trim(),
			}),
			isAdmin: formData.value.role === "admin",
			isWatcher: formData.value.role === "watcher",
		};

		await createUser(userData);
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
				<label for="role"> Role <span class="required">*</span> </label>
				<select id="role" v-model="formData.role" required>
					<option value="voter">Voter</option>
					<option value="watcher">Watcher (Observer)</option>
					<option value="admin">Admin</option>
				</select>
				<p class="role-description">
					<template v-if="formData.role === 'voter'">
						Voters can view open motions and cast votes.
					</template>
					<template v-else-if="formData.role === 'watcher'">
						Watchers have read-only access to meeting reports, quorum status,
						and completed motion results. They cannot vote.
					</template>
					<template v-else-if="formData.role === 'admin'">
						Admins can manage users, meetings, motions, and system settings.
						They cannot vote.
					</template>
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
