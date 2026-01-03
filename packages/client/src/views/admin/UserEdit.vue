<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getUser, updateUser } from "../../services/api";
import type { User } from "@mcdc-convention-voting/shared";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();

// Constants
const EMPTY_STRING = "";

const user = ref<User | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const formData = ref({
	voterId: EMPTY_STRING,
	firstName: EMPTY_STRING,
	lastName: EMPTY_STRING,
	username: EMPTY_STRING,
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
			};
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load user";
	} finally {
		loading.value = false;
	}
}

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
			username: formData.value.username.trim(),
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

			<div class="user-info">
				<p>
					<strong>Status:</strong> {{ user.isDisabled ? "Disabled" : "Active" }}
				</p>
				<p><strong>Admin:</strong> {{ user.isAdmin ? "Yes" : "No" }}</p>
				<p>
					<strong>Created:</strong>
					{{ new Date(user.createdAt).toLocaleString() }}
				</p>
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
