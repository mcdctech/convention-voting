<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { createPool } from "../../services/api";

const router = useRouter();

// Constants
const EMPTY_STRING = "";

const formData = ref({
	poolKey: EMPTY_STRING,
	poolName: EMPTY_STRING,
	description: EMPTY_STRING,
});

const saving = ref(false);
const error = ref<string | null>(null);

async function handleSubmit(): Promise<void> {
	error.value = null;

	if (
		formData.value.poolKey.trim() === EMPTY_STRING ||
		formData.value.poolName.trim() === EMPTY_STRING
	) {
		error.value = "Pool Key and Pool Name are required.";
		return;
	}

	saving.value = true;

	try {
		const poolData = {
			poolKey: formData.value.poolKey.trim(),
			poolName: formData.value.poolName.trim(),
			...(formData.value.description.trim() !== EMPTY_STRING && {
				description: formData.value.description.trim(),
			}),
		};

		await createPool(poolData);
		void router.push("/admin/pools");
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to create pool";
	} finally {
		saving.value = false;
	}
}

function cancel(): void {
	void router.push("/admin/pools");
}
</script>

<template>
	<div class="pool-create">
		<h2>Create New Pool</h2>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<form class="pool-form" @submit.prevent="handleSubmit">
			<div class="form-group">
				<label for="poolKey"> Pool Key <span class="required">*</span> </label>
				<input id="poolKey" v-model="formData.poolKey" type="text" required />
				<p class="field-description">
					Unique identifier for the pool (e.g., "congressional-district-1")
				</p>
			</div>

			<div class="form-group">
				<label for="poolName">
					Pool Name <span class="required">*</span>
				</label>
				<input id="poolName" v-model="formData.poolName" type="text" required />
				<p class="field-description">
					Display name for the pool (e.g., "Congressional District 1")
				</p>
			</div>

			<div class="form-group">
				<label for="description">
					Description
					<span class="optional">(optional)</span>
				</label>
				<textarea id="description" v-model="formData.description" rows="3" />
				<p class="field-description">
					Optional description or notes about this pool
				</p>
			</div>

			<div class="form-actions">
				<button type="submit" class="btn btn-primary" :disabled="saving">
					{{ saving ? "Creating..." : "Create Pool" }}
				</button>
				<button type="button" class="btn btn-secondary" @click="cancel">
					Cancel
				</button>
			</div>
		</form>
	</div>
</template>

<style scoped>
.pool-create {
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

.pool-form {
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

.field-description {
	margin-top: 0.25rem;
	font-size: 0.875rem;
	color: #757575;
}

.form-group input,
.form-group textarea {
	width: 100%;
	padding: 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	font-size: 1rem;
	font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus {
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
</style>
