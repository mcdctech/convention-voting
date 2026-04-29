<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { PoolType } from "@mcdc-convention-voting/shared";
import { createMeeting, getPools } from "../../services/api";
import type { Pool } from "@mcdc-convention-voting/shared";

const router = useRouter();

// Constants
const EMPTY_STRING = "";
const ALL_POOLS_LIMIT = 1000;
const INITIAL_PAGE = 1;

const pools = ref<Pool[]>([]);
const loadingPools = ref(false);

// Pools eligible for quorum voting (voter type or legacy null type)
const quorumEligiblePools = computed(() =>
	pools.value.filter(
		(pool) => pool.poolType === null || pool.poolType === PoolType.Voter,
	),
);

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

interface FormDataType {
	name: string;
	description: string;
	startDate: string;
	endDate: string;
	quorumVotingPoolId: string;
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
					<option
						v-for="pool in quorumEligiblePools"
						:key="pool.id"
						:value="pool.id"
					>
						{{ pool.poolName }}
					</option>
				</select>
				<p class="field-description">
					The pool used to determine quorum for this meeting. Only pools with
					"Voter" type or unspecified type can be used as quorum pools.
				</p>
			</div>

			<div class="info-box">
				<strong>Auto-Created Pools</strong>
				<p>
					The following pools will be automatically created when this meeting is
					saved:
				</p>
				<ul>
					<li>
						<strong>{{ formData.name || "Meeting Name" }} - Watchers</strong> -
						Users in this pool can observe the meeting
					</li>
					<li>
						<strong
							>{{ formData.name || "Meeting Name" }} - Meeting Admins</strong
						>
						- Users in this pool can administer the meeting
					</li>
				</ul>
				<p class="info-note">
					You can add users to these pools after the meeting is created.
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

.info-box {
	background-color: #e3f2fd;
	border: 1px solid #90caf9;
	border-radius: 4px;
	padding: 1rem;
	margin-bottom: 1.5rem;
}

.info-box strong {
	color: #1565c0;
}

.info-box p {
	margin: 0.5rem 0;
	color: #424242;
}

.info-box ul {
	margin: 0.5rem 0;
	padding-left: 1.5rem;
}

.info-box li {
	margin: 0.25rem 0;
	color: #424242;
}

.info-note {
	font-size: 0.875rem;
	font-style: italic;
	color: #666 !important;
}
</style>
