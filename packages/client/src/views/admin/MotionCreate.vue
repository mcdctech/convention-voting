<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter, onBeforeRouteLeave } from "vue-router";
import { createChoice, createMotion, getPools } from "../../services/api";
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
const FIRST_INDEX = 0;
const ADJACENT_OFFSET = 1;
const EMPTY_ARRAY_LENGTH = 0;

const pools = ref<Pool[]>([]);
const loadingPools = ref(false);

const formData = ref({
	name: EMPTY_STRING,
	description: EMPTY_STRING,
	plannedDuration: DEFAULT_DURATION,
	seatCount: DEFAULT_SEAT_COUNT,
	votingPoolId: EMPTY_STRING,
});

const pendingChoices = ref<string[]>([]);
const newChoiceName = ref(EMPTY_STRING);
const choiceError = ref<string | null>(null);

const saving = ref(false);
const saved = ref(false);
const error = ref<string | null>(null);

const isDirty = computed((): boolean => {
	if (saved.value) {
		return false;
	}
	return (
		formData.value.name !== EMPTY_STRING ||
		formData.value.description !== EMPTY_STRING ||
		formData.value.plannedDuration !== DEFAULT_DURATION ||
		formData.value.seatCount !== DEFAULT_SEAT_COUNT ||
		formData.value.votingPoolId !== EMPTY_STRING ||
		pendingChoices.value.length > EMPTY_ARRAY_LENGTH
	);
});

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

function addPendingChoice(): void {
	if (newChoiceName.value.trim() === EMPTY_STRING) {
		choiceError.value = "Choice name is required.";
		return;
	}
	choiceError.value = null;
	pendingChoices.value.push(newChoiceName.value.trim());
	newChoiceName.value = EMPTY_STRING;
}

function removePendingChoice(index: number): void {
	pendingChoices.value.splice(index, ADJACENT_OFFSET);
}

function movePendingChoiceUp(index: number): void {
	if (index === FIRST_INDEX) {
		return;
	}
	const previousIndex = index - ADJACENT_OFFSET;
	const items = pendingChoices.value;
	[items[previousIndex], items[index]] = [items[index], items[previousIndex]];
}

function movePendingChoiceDown(index: number): void {
	const lastIndex = pendingChoices.value.length - ADJACENT_OFFSET;
	if (index >= lastIndex) {
		return;
	}
	const nextIndex = index + ADJACENT_OFFSET;
	const items = pendingChoices.value;
	[items[index], items[nextIndex]] = [items[nextIndex], items[index]];
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

		const response = await createMotion(motionData);
		const newMotionId = response.data.id;

		// Create pending choices sequentially
		for (const choiceName of pendingChoices.value) {
			// eslint-disable-next-line no-await-in-loop -- Sequential inserts required for choices
			await createChoice({
				motionId: newMotionId,
				name: choiceName,
			});
		}

		saved.value = true;
		void router.push(`/admin/motions/${String(newMotionId)}`);
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

function handleBeforeUnload(e: BeforeUnloadEvent): void {
	if (isDirty.value) {
		e.preventDefault();
	}
}

onBeforeRouteLeave(() => {
	if (isDirty.value) {
		// eslint-disable-next-line no-alert -- User-facing confirmation for unsaved changes
		const answer = window.confirm(
			"You have unsaved changes. Are you sure you want to leave?",
		);
		if (!answer) {
			return false;
		}
	}
	return true;
});

onMounted(() => {
	void loadPools();
	window.addEventListener("beforeunload", handleBeforeUnload);
});

onUnmounted(() => {
	window.removeEventListener("beforeunload", handleBeforeUnload);
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

			<!-- Choices Section -->
			<div class="form-group choices-group">
				<label>Choices</label>
				<p class="field-description">
					Define the options voters can choose from. Choices can also be added
					after creation.
				</p>

				<div v-if="choiceError" class="error-inline">
					{{ choiceError }}
				</div>

				<div v-if="pendingChoices.length === 0" class="empty-choices">
					No choices added yet.
				</div>

				<ul v-else class="choices-list">
					<li v-for="(choice, index) in pendingChoices" :key="index">
						<span class="choice-name">{{ choice }}</span>
						<div class="choice-actions">
							<button
								type="button"
								class="btn btn-small"
								:disabled="index === 0"
								title="Move up"
								@click="movePendingChoiceUp(index)"
							>
								&uarr;
							</button>
							<button
								type="button"
								class="btn btn-small"
								:disabled="index >= pendingChoices.length - 1"
								title="Move down"
								@click="movePendingChoiceDown(index)"
							>
								&darr;
							</button>
							<button
								type="button"
								class="btn btn-small btn-danger"
								title="Delete"
								@click="removePendingChoice(index)"
							>
								Delete
							</button>
						</div>
					</li>
				</ul>

				<div class="add-choice-form">
					<input
						v-model="newChoiceName"
						type="text"
						placeholder="Enter choice name"
						@keydown.enter.prevent="addPendingChoice"
					/>
					<button
						type="button"
						class="btn btn-primary btn-small"
						@click="addPendingChoice"
					>
						Add Choice
					</button>
				</div>
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

.btn-small {
	padding: 0.25rem 0.5rem;
	font-size: 0.8125rem;
}

.btn-danger {
	background-color: #dc3545;
	color: white;
}

.btn-danger:hover:not(:disabled) {
	background-color: #c82333;
}

.error-inline {
	padding: 0.75rem;
	margin-bottom: 1rem;
	background-color: #ffebee;
	color: #c62828;
	border-radius: 4px;
	font-size: 0.875rem;
}

.choices-group {
	margin-top: 1.5rem;
}

.empty-choices {
	padding: 1rem;
	color: #666;
	font-style: italic;
}

.choices-list {
	list-style: none;
	padding: 0;
	margin: 0 0 1.5rem 0;
}

.choices-list li {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	margin-bottom: 0.5rem;
}

.choice-name {
	font-weight: 500;
}

.choice-actions {
	display: flex;
	gap: 0.25rem;
}

.add-choice-form {
	display: flex;
	gap: 0.5rem;
}

.add-choice-form input {
	flex: 1;
	padding: 0.5rem 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	font-size: 0.875rem;
}

.add-choice-form input:focus {
	outline: none;
	border-color: #1976d2;
}
</style>
