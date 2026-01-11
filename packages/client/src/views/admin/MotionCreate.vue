<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { createMotion, getPools } from "../../services/api";
import type { Pool } from "@mcdc-convention-voting/shared";

const props = defineProps<{
	meetingId: string;
}>();

const router = useRouter();

// Constants
const EMPTY_STRING = "";
const ALL_POOLS_LIMIT = 1000;
const INITIAL_PAGE = 1;
const DECIMAL_RADIX = 10;
const DEFAULT_SEAT_COUNT = 1;
const DEFAULT_DURATION = 5;
const MIN_DURATION = 1;
const MIN_SEAT_COUNT = 1;

const pools = ref<Pool[]>([]);
const loadingPools = ref(false);

const formData = ref({
	name: EMPTY_STRING,
	description: EMPTY_STRING,
	plannedDuration: DEFAULT_DURATION,
	seatCount: DEFAULT_SEAT_COUNT,
	votingPoolId: EMPTY_STRING,
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

	if (formData.value.plannedDuration < MIN_DURATION) {
		error.value = "Duration must be at least 1 minute.";
		return;
	}

	if (formData.value.seatCount < MIN_SEAT_COUNT) {
		error.value = "Selection count must be at least 1.";
		return;
	}

	saving.value = true;

	try {
		const meetingIdNum = Number.parseInt(props.meetingId, DECIMAL_RADIX);
		const motionData = {
			meetingId: meetingIdNum,
			name: formData.value.name.trim(),
			plannedDuration: formData.value.plannedDuration,
			seatCount: formData.value.seatCount,
			...(formData.value.description.trim() !== EMPTY_STRING && {
				description: formData.value.description.trim(),
			}),
			...(formData.value.votingPoolId !== EMPTY_STRING && {
				votingPoolId: Number.parseInt(
					formData.value.votingPoolId,
					DECIMAL_RADIX,
				),
			}),
		};

		await createMotion(motionData);
		void router.push(`/admin/meetings/${props.meetingId}/motions`);
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to create motion";
	} finally {
		saving.value = false;
	}
}

function cancel(): void {
	void router.push(`/admin/meetings/${props.meetingId}/motions`);
}

onMounted(() => {
	void loadPools();
});
</script>

<template>
	<div class="motion-create">
		<h2>Create New Motion</h2>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<form class="motion-form" @submit.prevent="handleSubmit">
			<div class="form-group">
				<label for="name"> Name <span class="required">*</span> </label>
				<input id="name" v-model="formData.name" type="text" required />
				<p class="field-description">
					Name of the motion (e.g., "Election of Board Members")
				</p>
			</div>

			<div class="form-group">
				<label for="description">
					Description
					<span class="optional">(optional)</span>
				</label>
				<textarea id="description" v-model="formData.description" rows="3" />
			</div>

			<div class="form-group">
				<label for="plannedDuration">
					Planned Duration (minutes) <span class="required">*</span>
				</label>
				<input
					id="plannedDuration"
					v-model.number="formData.plannedDuration"
					type="number"
					min="1"
					required
				/>
				<p class="field-description">
					Estimated duration for voting on this motion
				</p>
			</div>

			<div class="form-group">
				<label for="seatCount">
					Selection Count
					<span class="optional">(default: 1)</span>
				</label>
				<input
					id="seatCount"
					v-model.number="formData.seatCount"
					type="number"
					min="1"
				/>
				<p class="field-description">
					Number of seats to elect (for elections) or 1 for yes/no votes
				</p>
			</div>

			<div class="form-group">
				<label for="votingPoolId">
					Voting Pool
					<span class="optional">(optional)</span>
				</label>
				<select
					id="votingPoolId"
					v-model="formData.votingPoolId"
					:disabled="loadingPools"
				>
					<option value="">
						{{
							loadingPools ? "Loading pools..." : "Use meeting's quorum pool"
						}}
					</option>
					<option v-for="pool in pools" :key="pool.id" :value="pool.id">
						{{ pool.poolName }}
					</option>
				</select>
				<p class="field-description">
					Override the meeting's quorum pool for this specific motion
				</p>
			</div>

			<div class="form-actions">
				<button type="submit" class="btn btn-primary" :disabled="saving">
					{{ saving ? "Creating..." : "Create Motion" }}
				</button>
				<button type="button" class="btn btn-secondary" @click="cancel">
					Cancel
				</button>
			</div>
		</form>
	</div>
</template>

<style scoped>
.motion-create {
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

.motion-form {
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
