<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { generatePasswordsWithProgress, getPools } from "../../services/api";
import type {
	PasswordGenerationResult,
	PasswordGenerationProgress,
	Pool,
} from "@mcdc-convention-voting/shared";

const ALL_POOLS_LIMIT = 1000;
const INITIAL_PAGE = 1;
const PERCENTAGE_MULTIPLIER = 100;
const INITIAL_PROGRESS = 0;
const EMPTY_RESULTS_LENGTH = 0;

// Pool filter special values (matching UserList.vue for consistency)
const POOL_FILTER_ALL = "all";
const POOL_FILTER_NO_POOL = "no-pool";

const generating = ref(false);
const error = ref<string | null>(null);
const results = ref<PasswordGenerationResult[] | null>(null);
const generationComplete = ref(false);
const hasDownloaded = ref(false);
const showSkipWarningModal = ref(false);

// Progress tracking
const progressPhase = ref<string>("");
const progressCurrent = ref<number>(INITIAL_PROGRESS);
const progressTotal = ref<number>(INITIAL_PROGRESS);
const progressMessage = ref<string>("");

const progressPercentage = computed(() => {
	if (progressTotal.value === INITIAL_PROGRESS) {
		return INITIAL_PROGRESS;
	}
	return Math.round(
		(progressCurrent.value / progressTotal.value) * PERCENTAGE_MULTIPLIER,
	);
});

// Pool selection
const pools = ref<Pool[]>([]);
const loadingPools = ref(false);
const selectedPoolFilter = ref<string>(POOL_FILTER_ALL);
const onlyNullPasswords = ref(false);

// Sort pools alphabetically by name (matching UserList.vue)
const sortedPools = computed((): Pool[] =>
	[...pools.value]
		.filter((pool) => !pool.isDisabled)
		.sort((a, b) =>
			a.poolName.toLowerCase().localeCompare(b.poolName.toLowerCase()),
		),
);

// Sort results alphabetically by username for easier distribution
const sortedResults = computed((): PasswordGenerationResult[] => {
	if (results.value === null) {
		return [];
	}
	return [...results.value].sort((a, b) =>
		a.username.toLowerCase().localeCompare(b.username.toLowerCase()),
	);
});

const showConfirmModal = ref(false);

async function loadPools(): Promise<void> {
	loadingPools.value = true;
	try {
		const response = await getPools({
			page: INITIAL_PAGE,
			limit: ALL_POOLS_LIMIT,
		});
		pools.value = response.data;
	} catch (err) {
		// Silently fail - pools dropdown will just be empty
	} finally {
		loadingPools.value = false;
	}
}

onMounted(() => {
	void loadPools();
});

function requestGenerate(): void {
	showConfirmModal.value = true;
}

function cancelGenerate(): void {
	showConfirmModal.value = false;
}

async function handleGenerate(): Promise<void> {
	showConfirmModal.value = false;

	generating.value = true;
	error.value = null;
	results.value = null;
	generationComplete.value = false;

	// Reset progress
	progressPhase.value = "";
	progressCurrent.value = INITIAL_PROGRESS;
	progressTotal.value = INITIAL_PROGRESS;
	progressMessage.value = "";

	try {
		// Determine pool filter options based on selection
		const isNoPool = selectedPoolFilter.value === POOL_FILTER_NO_POOL;
		const isAllPools = selectedPoolFilter.value === POOL_FILTER_ALL;
		const poolId =
			!isNoPool && !isAllPools
				? Number.parseInt(selectedPoolFilter.value, 10)
				: undefined;

		const response = await generatePasswordsWithProgress(
			{
				poolId,
				noPool: isNoPool || undefined,
				onlyNullPasswords: onlyNullPasswords.value || undefined,
			},
			(progress: PasswordGenerationProgress) => {
				// Update progress state
				progressPhase.value = progress.phase;
				progressCurrent.value = progress.current;
				progressTotal.value = progress.total;
				progressMessage.value = progress.message;
			},
		);

		results.value = response.results;
		generationComplete.value = true;
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to generate passwords";
	} finally {
		generating.value = false;
	}
}

function downloadCSV(): void {
	if (
		results.value === null ||
		sortedResults.value.length === EMPTY_RESULTS_LENGTH
	) {
		return;
	}

	const csvContent = [
		["Username", "Password", "Voter ID"].join(","),
		...sortedResults.value.map((r) =>
			[r.username, r.password, r.voterId].join(","),
		),
	].join("\n");

	const blob = new Blob([csvContent], { type: "text/csv" });
	const url = window.URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `passwords-${new Date().toISOString()}.csv`;
	link.click();
	window.URL.revokeObjectURL(url);

	// Track that user has downloaded
	hasDownloaded.value = true;
}

function resetForm(): void {
	results.value = null;
	generationComplete.value = false;
	hasDownloaded.value = false;
	error.value = null;
	progressPhase.value = "";
	progressCurrent.value = INITIAL_PROGRESS;
	progressTotal.value = INITIAL_PROGRESS;
	progressMessage.value = "";
}

function handleGenerateMore(): void {
	// If user hasn't downloaded and there are results, show warning
	if (
		!hasDownloaded.value &&
		results.value !== null &&
		results.value.length > EMPTY_RESULTS_LENGTH
	) {
		showSkipWarningModal.value = true;
		return;
	}
	resetForm();
}

function confirmSkipDownload(): void {
	showSkipWarningModal.value = false;
	resetForm();
}

function cancelSkipDownload(): void {
	showSkipWarningModal.value = false;
}

function getPoolFilterDescription(): string {
	if (selectedPoolFilter.value === POOL_FILTER_ALL) {
		return "all pools";
	}
	if (selectedPoolFilter.value === POOL_FILTER_NO_POOL) {
		return "users not assigned to any pool";
	}
	const poolId = Number.parseInt(selectedPoolFilter.value, 10);
	return pools.value.find((p) => p.id === poolId)?.poolName ?? "selected pool";
}

function getConfirmationMessage(): string {
	const poolFilter = getPoolFilterDescription();
	const passwordFilter = onlyNullPasswords.value
		? "users without existing passwords"
		: "all users";

	if (selectedPoolFilter.value === POOL_FILTER_NO_POOL) {
		return `This will generate passwords for ${passwordFilter} who are ${poolFilter}. Admin accounts will not be affected.`;
	}
	return `This will generate passwords for ${passwordFilter} in ${poolFilter}. Admin accounts will not be affected.`;
}
</script>

<template>
	<div class="password-generation">
		<h2>Generate Passwords</h2>

		<div class="warning-box">
			<h3>Important Information</h3>
			<p>
				<strong>
					This will generate passwords for selected voters and watchers.
				</strong>
			</p>
			<p class="note">Admin accounts are not affected by this operation.</p>
			<ul>
				<li>Each password consists of a 5-letter word followed by 3 digits</li>
				<li>Passwords are immediately hashed after generation</li>
				<li>
					You MUST save or download the generated passwords before leaving this
					page
				</li>
			</ul>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div class="generation-section">
			<!-- Filter Options -->
			<div class="filter-options">
				<div class="filter-group">
					<label for="pool-select">Filter by Pool:</label>
					<select
						id="pool-select"
						v-model="selectedPoolFilter"
						:disabled="generating || results !== null || loadingPools"
					>
						<option :value="POOL_FILTER_ALL">All</option>
						<option :value="POOL_FILTER_NO_POOL">None (No Pool)</option>
						<option
							v-for="pool in sortedPools"
							:key="pool.id"
							:value="String(pool.id)"
						>
							{{ pool.poolName }}
						</option>
					</select>
				</div>

				<div class="filter-group checkbox-group">
					<label class="checkbox-label">
						<input
							v-model="onlyNullPasswords"
							type="checkbox"
							:disabled="generating || results !== null"
						/>
						Only users without existing passwords
					</label>
					<span class="filter-hint">
						Check this to preserve existing passwords and only generate for new
						users
					</span>
				</div>
			</div>

			<button
				class="btn btn-primary btn-large"
				:disabled="generating || results !== null"
				@click="requestGenerate"
			>
				{{ generating ? "Generating Passwords..." : "Generate Passwords" }}
			</button>
		</div>

		<!-- Progress Section - Show immediately when generating starts -->
		<div v-if="generating" class="progress-section">
			<h3>Progress</h3>
			<!-- Show detailed progress once we have data -->
			<template v-if="progressTotal > 0">
				<div class="progress-info">
					<span class="progress-phase">{{ progressMessage }}</span>
					<span class="progress-stats">
						{{ progressCurrent }} / {{ progressTotal }} ({{
							progressPercentage
						}}%)
					</span>
				</div>
				<div class="progress-bar-container">
					<div
						class="progress-bar"
						:style="{ width: `${progressPercentage}%` }"
					></div>
				</div>
			</template>
			<!-- Show initial state before first progress event -->
			<template v-else>
				<div class="progress-info">
					<span class="progress-phase">Starting password generation...</span>
				</div>
				<div class="progress-bar-container">
					<div class="progress-bar progress-bar-indeterminate"></div>
				</div>
			</template>
		</div>

		<div v-if="showConfirmModal" class="modal" @click="cancelGenerate">
			<div class="modal-content" @click.stop>
				<h3>Confirm Password Generation</h3>
				<p>
					{{ getConfirmationMessage() }}
				</p>
				<p v-if="!onlyNullPasswords" class="warning-text">
					Existing passwords will be reset and cannot be recovered.
				</p>
				<div class="modal-actions">
					<button class="btn btn-primary" @click="handleGenerate">
						Yes, Generate Passwords
					</button>
					<button class="btn btn-secondary" @click="cancelGenerate">
						Cancel
					</button>
				</div>
			</div>
		</div>

		<!-- Success Banner -->
		<div v-if="generationComplete" class="success-banner">
			<span class="success-icon">✓</span>
			<span class="success-text">Password Generation Complete!</span>
		</div>

		<!-- No Results Message -->
		<div v-if="results && results.length === 0" class="results-section">
			<div class="no-results">
				<p>No users matched the selected filters.</p>
				<p class="no-results-hint">
					Try changing the pool filter or unchecking "Only users without
					existing passwords".
				</p>
				<button class="btn btn-secondary" @click="resetForm">
					Generate More Passwords
				</button>
			</div>
		</div>

		<!-- Download Action Box - Prominent section for downloading -->
		<div v-if="results && results.length > 0" class="download-action-box">
			<div class="download-warning-header">
				<span class="warning-icon">⚠</span>
				<strong>IMPORTANT: Download these passwords now!</strong>
			</div>
			<p class="download-warning-text">
				These passwords will NOT be shown again after you leave this page or
				generate new passwords.
			</p>
			<div class="download-actions">
				<button class="btn btn-primary btn-download" @click="downloadCSV">
					Download Passwords CSV
				</button>
				<button class="btn btn-secondary" @click="handleGenerateMore">
					Generate More Passwords
				</button>
			</div>
			<p v-if="hasDownloaded" class="download-confirmed">
				✓ Passwords downloaded
			</p>
		</div>

		<!-- Results Table -->
		<div v-if="results && results.length > 0" class="results-section">
			<div class="results-header">
				<h3>Generated Passwords ({{ results.length }})</h3>
			</div>

			<table class="results-table">
				<thead>
					<tr>
						<th>Username</th>
						<th>Password</th>
						<th>Voter ID</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="result in sortedResults" :key="result.voterId">
						<td>{{ result.username }}</td>
						<td class="password">
							{{ result.password }}
						</td>
						<td class="voter-id">
							{{ result.voterId }}
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!-- Skip Download Warning Modal -->
		<div v-if="showSkipWarningModal" class="modal" @click="cancelSkipDownload">
			<div class="modal-content" @click.stop>
				<h3 class="warning-modal-title">⚠ Passwords Not Downloaded</h3>
				<p>You have not downloaded the generated passwords.</p>
				<p class="warning-text">
					If you continue, these passwords will be permanently lost and cannot
					be recovered.
				</p>
				<div class="modal-actions">
					<button class="btn btn-primary" @click="cancelSkipDownload">
						Go Back & Download
					</button>
					<button class="btn btn-danger" @click="confirmSkipDownload">
						Continue Without Downloading
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.password-generation {
	max-width: 900px;
}

h2 {
	margin-bottom: 1.5rem;
	color: #2c3e50;
}

.warning-box {
	background: #fff3e0;
	border-left: 4px solid #f57c00;
	padding: 1.5rem;
	margin-bottom: 2rem;
	border-radius: 4px;
}

.warning-box h3 {
	margin-top: 0;
	color: #e65100;
}

.warning-box ul {
	margin: 1rem 0 0 1.5rem;
}

.warning-box li {
	margin: 0.5rem 0;
}

.warning-box .note {
	font-size: 0.875rem;
	color: #5d4037;
	margin-top: 0.5rem;
}

.error {
	padding: 1rem;
	margin-bottom: 1rem;
	background-color: #ffebee;
	color: #c62828;
	border-radius: 4px;
}

.generation-section {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	margin-bottom: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.filter-options {
	margin-bottom: 2rem;
}

.filter-group {
	margin-bottom: 1.5rem;
}

.filter-group label {
	display: block;
	margin-bottom: 0.5rem;
	font-weight: 500;
	color: #333;
}

.filter-group select {
	width: 100%;
	max-width: 400px;
	padding: 0.75rem;
	border: 1px solid #ddd;
	border-radius: 4px;
	font-size: 1rem;
}

.filter-group select:disabled {
	background-color: #f5f5f5;
	cursor: not-allowed;
}

.checkbox-group {
	display: flex;
	flex-direction: column;
}

.checkbox-label {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	cursor: pointer;
	font-weight: normal;
}

.checkbox-label input[type="checkbox"] {
	width: 18px;
	height: 18px;
	cursor: pointer;
}

.filter-hint {
	font-size: 0.8125rem;
	color: #666;
	margin-top: 0.25rem;
	margin-left: 1.625rem;
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

.btn-large {
	padding: 1rem 2rem;
	font-size: 1.125rem;
	display: block;
	margin: 0 auto;
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

.results-section {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.results-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1rem;
}

.results-header h3 {
	margin: 0;
	color: #2c3e50;
}

.no-results {
	padding: 2rem;
	text-align: center;
	color: #666;
}

.no-results-hint {
	font-size: 0.875rem;
	color: #999;
	margin-top: 0.5rem;
}

.results-table {
	width: 100%;
	border-collapse: collapse;
	margin-top: 1rem;
}

.results-table th,
.results-table td {
	padding: 0.75rem;
	text-align: left;
	border-bottom: 1px solid #e0e0e0;
}

.results-table th {
	background-color: #f5f5f5;
	font-weight: 600;
	color: #2c3e50;
}

.results-table tbody tr:hover {
	background-color: #fafafa;
}

.password {
	font-family: monospace;
	font-size: 1.125rem;
	font-weight: 600;
	color: #1976d2;
}

.voter-id {
	font-family: monospace;
	font-size: 0.875rem;
	color: #757575;
}

.modal {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(0, 0, 0, 0.5);
	display: flex;
	justify-content: center;
	align-items: center;
	z-index: 1000;
}

.modal-content {
	background: white;
	padding: 2rem;
	border-radius: 8px;
	max-width: 500px;
	width: 90%;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal-content h3 {
	margin-top: 0;
	margin-bottom: 1rem;
	color: #2c3e50;
}

.warning-text {
	color: #c62828;
	font-weight: 500;
}

.modal-actions {
	display: flex;
	gap: 1rem;
	margin-top: 1.5rem;
	justify-content: flex-end;
}

.progress-section {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	margin-bottom: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.progress-section h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
}

.progress-info {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1rem;
}

.progress-phase {
	font-weight: 500;
	color: #2c3e50;
}

.progress-stats {
	font-weight: 600;
	color: #1976d2;
	font-size: 1.125rem;
}

.progress-bar-container {
	width: 100%;
	height: 24px;
	background-color: #e0e0e0;
	border-radius: 12px;
	overflow: hidden;
}

.progress-bar {
	height: 100%;
	background: linear-gradient(90deg, #1976d2, #42a5f5);
	transition: width 0.3s ease-in-out;
	border-radius: 12px;
}

.progress-bar-indeterminate {
	width: 30%;
	animation: indeterminate 1.5s infinite ease-in-out;
}

@keyframes indeterminate {
	0% {
		transform: translateX(-100%);
	}
	100% {
		transform: translateX(400%);
	}
}

.success-banner {
	display: flex;
	align-items: center;
	gap: 1rem;
	background: #e8f5e9;
	border-left: 4px solid #4caf50;
	padding: 1rem 1.5rem;
	margin-bottom: 1.5rem;
	border-radius: 4px;
}

.success-icon {
	font-size: 1.5rem;
	color: #4caf50;
	font-weight: bold;
}

.success-text {
	flex: 1;
	font-size: 1.125rem;
	font-weight: 600;
	color: #2e7d32;
}

.btn-small {
	padding: 0.5rem 1rem;
	font-size: 0.875rem;
}

.btn-danger {
	background-color: #c62828;
	color: white;
}

.btn-danger:hover:not(:disabled) {
	background-color: #b71c1c;
}

.download-action-box {
	background: #fff3e0;
	border: 2px solid #f57c00;
	border-radius: 8px;
	padding: 1.5rem 2rem;
	margin-bottom: 2rem;
	text-align: center;
}

.download-warning-header {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	font-size: 1.25rem;
	color: #e65100;
	margin-bottom: 0.75rem;
}

.warning-icon {
	font-size: 1.5rem;
}

.download-warning-text {
	color: #5d4037;
	margin-bottom: 1.5rem;
	font-size: 1rem;
}

.download-actions {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1rem;
}

.btn-download {
	padding: 1rem 2rem;
	font-size: 1.125rem;
	font-weight: 600;
	min-width: 280px;
}

.download-confirmed {
	color: #2e7d32;
	font-weight: 500;
	margin-top: 1rem;
	margin-bottom: 0;
}

.warning-modal-title {
	color: #e65100;
	margin-top: 0;
}
</style>
