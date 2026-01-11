<script setup lang="ts">
import { ref } from "vue";
import { generatePasswords } from "../../services/api";
import type { PasswordGenerationResult } from "@mcdc-convention-voting/shared";

const generating = ref(false);
const error = ref<string | null>(null);
const results = ref<PasswordGenerationResult[] | null>(null);

const showConfirmModal = ref(false);

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

	try {
		const response = await generatePasswords();
		if (response.data !== undefined) {
			const { data } = response;
			const { results: generatedResults } = data;
			results.value = generatedResults;
		}
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to generate passwords";
	} finally {
		generating.value = false;
	}
}

function downloadCSV(): void {
	if (results.value === null) {
		return;
	}

	const csvContent = [
		["Username", "Password", "Voter ID"].join(","),
		...results.value.map((r) => [r.username, r.password, r.voterId].join(",")),
	].join("\n");

	const blob = new Blob([csvContent], { type: "text/csv" });
	const url = window.URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `passwords-${new Date().toISOString()}.csv`;
	link.click();
	window.URL.revokeObjectURL(url);
}
</script>

<template>
	<div class="password-generation">
		<h2>Generate Passwords</h2>

		<div class="warning-box">
			<h3>⚠️ Important Information</h3>
			<p>
				<strong>
					This will generate NEW passwords for ALL users in the system.
				</strong>
			</p>
			<ul>
				<li>ALL existing passwords will be reset</li>
				<li>Passwords are generated once and cannot be retrieved again</li>
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
			<button
				class="btn btn-primary btn-large"
				:disabled="generating || results !== null"
				@click="requestGenerate"
			>
				{{ generating ? "Generating Passwords..." : "Generate Passwords" }}
			</button>
		</div>

		<div v-if="showConfirmModal" class="modal" @click="cancelGenerate">
			<div class="modal-content" @click.stop>
				<h3>Confirm Password Generation</h3>
				<p>
					Are you sure you want to generate NEW passwords for ALL users? This
					will reset ALL existing passwords and cannot be undone.
				</p>
				<div class="modal-actions">
					<button class="btn btn-primary" @click="handleGenerate">
						Yes, Reset All Passwords
					</button>
					<button class="btn btn-secondary" @click="cancelGenerate">
						Cancel
					</button>
				</div>
			</div>
		</div>

		<div v-if="results" class="results-section">
			<div class="results-header">
				<h3>Generated Passwords ({{ results.length }})</h3>
				<button class="btn btn-secondary" @click="downloadCSV">
					Download as CSV
				</button>
			</div>

			<div class="warning-box">
				<p>
					<strong>⚠️ SAVE THESE PASSWORDS NOW!</strong> They will not be shown
					again.
				</p>
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
					<tr v-for="result in results" :key="result.voterId">
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
	text-align: center;
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

.modal-actions {
	display: flex;
	gap: 1rem;
	margin-top: 1.5rem;
	justify-content: flex-end;
}
</style>
