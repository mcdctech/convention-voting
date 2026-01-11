<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { createMeeting, getPools } from "../../services/api";
import type { Pool } from "@mcdc-convention-voting/shared";

const router = useRouter();

// Constants
const EMPTY_STRING = "";
const ALL_POOLS_LIMIT = 1000;
const INITIAL_PAGE = 1;

const pools = ref<Pool[]>([]);
const loadingPools = ref(false);

const formData = ref({
	name: EMPTY_STRING,
	description: EMPTY_STRING,
	startDate: EMPTY_STRING,
	endDate: EMPTY_STRING,
	quorumVotingPoolId: EMPTY_STRING,
});

const saving = ref(false);
const error = ref<string | null>(null);

async function loadPools(): Promise<void> {
	loadingPools.value = true;
	try {
		const response = await getPools(INITIAL_PAGE, ALL_POOLS_LIMIT);
		pools.value = response.data.filter((pool) => !pool.isDisabled);
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load pools";
	} finally {
		loadingPools.value = false;
	}
}

async function handleSubmit(): Promise<void> {
	error.value = null;

	if (formData.value.name.trim() === EMPTY_STRING) {
		error.value = "Name is required.";
		return;
	}

	if (formData.value.startDate === EMPTY_STRING) {
		error.value = "Start date is required.";
		return;
	}

	if (formData.value.endDate === EMPTY_STRING) {
		error.value = "End date is required.";
		return;
	}

	if (formData.value.quorumVotingPoolId === EMPTY_STRING) {
		error.value = "Quorum voting pool is required.";
		return;
	}

	const startDate = new Date(formData.value.startDate);
	const endDate = new Date(formData.value.endDate);

	if (endDate <= startDate) {
		error.value = "End date must be after start date.";
		return;
	}

	saving.value = true;

	try {
		const meetingData = {
			name: formData.value.name.trim(),
			startDate: startDate.toISOString(),
			endDate: endDate.toISOString(),
			quorumVotingPoolId: Number.parseInt(
				formData.value.quorumVotingPoolId,
				10,
			),
			...(formData.value.description.trim() !== EMPTY_STRING && {
				description: formData.value.description.trim(),
			}),
		};

		await createMeeting(meetingData);
		void router.push("/admin/meetings");
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to create meeting";
	} finally {
		saving.value = false;
	}
}

function cancel(): void {
	void router.push("/admin/meetings");
}

onMounted(() => {
	void loadPools();
});
</script>

<template>
	<div class="meeting-create">
		<h2>Create New Meeting</h2>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<form class="meeting-form" @submit.prevent="handleSubmit">
			<div class="form-group">
				<label for="name"> Name <span class="required">*</span> </label>
				<input id="name" v-model="formData.name" type="text" required />
				<p class="field-description">
					Name of the meeting (e.g., "2024 Annual Convention")
				</p>
			</div>

			<div class="form-group">
				<label for="description">
					Description
					<span class="optional">(optional)</span>
				</label>
				<textarea id="description" v-model="formData.description" rows="3" />
				<p class="field-description">Optional description or notes</p>
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
					<option v-for="pool in pools" :key="pool.id" :value="pool.id">
						{{ pool.poolName }}
					</option>
				</select>
				<p class="field-description">
					The pool used to determine quorum for this meeting
				</p>
			</div>

			<div class="form-actions">
				<button type="submit" class="btn btn-primary" :disabled="saving">
					{{ saving ? "Creating..." : "Create Meeting" }}
				</button>
				<button type="button" class="btn btn-secondary" @click="cancel">
					Cancel
				</button>
			</div>
		</form>
	</div>
</template>

<style scoped>
.meeting-create {
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

.field-description {
	margin-top: 0.25rem;
	font-size: 0.875rem;
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
</style>
