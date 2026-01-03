<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getPool, updatePool } from "../../services/api";
import type { Pool } from "@mcdc-convention-voting/shared";

const props = defineProps<{
	id: string;
}>();

const router = useRouter();

// Constants
const EMPTY_STRING = "";

const pool = ref<Pool | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const formData = ref({
	poolKey: EMPTY_STRING,
	poolName: EMPTY_STRING,
	description: EMPTY_STRING,
});

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
			const { data: poolData } = response;
			pool.value = poolData;
			const { poolKey, poolName, description } = poolData;
			formData.value = {
				poolKey,
				poolName,
				description: description ?? EMPTY_STRING,
			};
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load pool";
	} finally {
		loading.value = false;
	}
}

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
		const poolId = Number.parseInt(props.id, 10);
		const poolData = {
			poolKey: formData.value.poolKey.trim(),
			poolName: formData.value.poolName.trim(),
			...(formData.value.description.trim() !== EMPTY_STRING && {
				description: formData.value.description.trim(),
			}),
		};

		await updatePool(poolId, poolData);
		void router.push("/admin/pools");
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to update pool";
	} finally {
		saving.value = false;
	}
}

function cancel(): void {
	void router.push("/admin/pools");
}

onMounted(() => {
	void loadPool();
});
</script>

<template>
	<div class="pool-edit">
		<h2>Edit Pool</h2>

		<div v-if="loading" class="loading">Loading pool...</div>

		<div v-if="error && !loading" class="error">
			{{ error }}
		</div>

		<form
			v-if="!loading && pool"
			class="pool-form"
			@submit.prevent="handleSubmit"
		>
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

			<div class="pool-info">
				<p>
					<strong>Status:</strong> {{ pool.isDisabled ? "Disabled" : "Active" }}
				</p>
				<p>
					<strong>Created:</strong>
					{{ new Date(pool.createdAt).toLocaleString() }}
				</p>
				<p>
					<strong>Last Updated:</strong>
					{{ new Date(pool.updatedAt).toLocaleString() }}
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
.pool-edit {
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

.pool-info {
	margin: 1.5rem 0;
	padding: 1rem;
	background-color: #f5f5f5;
	border-radius: 4px;
}

.pool-info p {
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
