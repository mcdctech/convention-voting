<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { validateUsersCSV, uploadUsersCSV } from "../../services/api";
import type { CSVValidationResult } from "@mcdc-convention-voting/shared";

const router = useRouter();

// Constants
const NO_FILES = 0;
const NO_ERRORS = 0;
const NO_WARNINGS = 0;
const NO_ITEMS = 0;
const PERCENTAGE_MULTIPLIER = 100;

const selectedFile = ref<File | null>(null);
const validating = ref(false);
const uploading = ref(false);
const error = ref<string | null>(null);
const validationResult = ref<CSVValidationResult | null>(null);
const uploadResult = ref<{
	success: number;
	failed: number;
	errors: Array<{ row: number; voterId: string; error: string }>;
	warnings?: Array<{ voterId: string; warning: string }>;
} | null>(null);

// Status message during validation/upload
const statusMessage = ref<string>("");
const showErrorDetails = ref(false);

function handleFileSelect(event: Event): void {
	if (!(event.target instanceof HTMLInputElement)) {
		return;
	}
	const { target } = event;
	const { files } = target;
	if (files !== null && files.length > NO_FILES) {
		const [file] = files;
		selectedFile.value = file;
		validationResult.value = null;
		uploadResult.value = null;
		statusMessage.value = "";
		error.value = null;
		showErrorDetails.value = false;
	}
}

async function handleValidate(): Promise<void> {
	if (selectedFile.value === null) {
		return;
	}

	validating.value = true;
	validationResult.value = null;
	uploadResult.value = null;
	error.value = null;
	statusMessage.value = "Validating CSV file...";
	showErrorDetails.value = false;

	try {
		const response = await validateUsersCSV(selectedFile.value);
		if (response.data !== undefined) {
			const { data } = response;
			validationResult.value = data;
			statusMessage.value = "";
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to validate CSV";
		statusMessage.value = "";
	} finally {
		validating.value = false;
	}
}

async function handleConfirmImport(): Promise<void> {
	if (selectedFile.value === null) {
		return;
	}

	uploading.value = true;
	uploadResult.value = null;
	error.value = null;
	statusMessage.value = "Importing users from CSV...";

	try {
		const response = await uploadUsersCSV(selectedFile.value);
		if (response.data !== undefined) {
			const { data } = response;
			uploadResult.value = data;
			statusMessage.value = "";
			validationResult.value = null;
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to import users";
		statusMessage.value = "";
	} finally {
		uploading.value = false;
	}
}

function startOver(): void {
	selectedFile.value = null;
	validationResult.value = null;
	uploadResult.value = null;
	error.value = null;
	statusMessage.value = "";
	showErrorDetails.value = false;
}

function goToUsers(): void {
	void router.push("/admin/users");
}
</script>

<template>
	<div class="user-upload">
		<h2>Upload Users from CSV</h2>

		<div class="upload-info">
			<h3>CSV Format Requirements</h3>
			<p>
				<a
					href="/templates/users-template.csv"
					download="users-template.csv"
					class="download-template"
				>
					Download Template CSV
				</a>
			</p>
			<p>The CSV file must contain the following columns:</p>
			<ul>
				<li>
					<strong>voter_id</strong> - Unique identifier for the voter. ASCII
					letters, numbers, hyphens, and underscores only (no spaces).
				</li>
				<li>
					<strong>first_name</strong> - Voter's first name. ASCII letters,
					spaces, hyphens, and apostrophes only.
				</li>
				<li>
					<strong>last_name</strong> - Voter's last name. ASCII letters, spaces,
					hyphens, and apostrophes only.
				</li>
				<li>
					<strong>user_type</strong> (optional) - User role: "voter" (default),
					"admin", or "watcher"
				</li>
				<li>
					<strong>is_enabled</strong> - Whether the user account is enabled:
					"true" or "1" for enabled, "false" or "0" for disabled
				</li>
				<li>
					<strong>pool_key_1</strong> through <strong>pool_key_10</strong>
					(optional) - Pool keys to assign the user to (up to 10 pools).
					Lowercase letters, numbers, hyphens, and underscores only.
				</li>
			</ul>
			<p>
				<em>
					Note: Usernames will be auto-generated from names. Passwords will be
					NULL initially and can be generated in bulk later.
				</em>
			</p>
			<p>
				<em>
					User types: "voter" can vote, "admin" can manage the system but cannot
					vote, "watcher" has read-only access to reports. If not specified,
					defaults to "voter".
				</em>
			</p>
			<p>
				<em>
					Pool assignments: Use pool_key_1, pool_key_2, etc. columns to assign
					users to pools. Pool keys must match existing pools (create pools
					first). Empty pool_key columns are ignored.
				</em>
			</p>
		</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div class="upload-form">
			<div class="form-group">
				<label for="csv-file">Select CSV File:</label>
				<input
					id="csv-file"
					type="file"
					accept=".csv"
					:disabled="validating || uploading"
					@change="handleFileSelect"
				/>
			</div>

			<div v-if="selectedFile" class="selected-file">
				Selected: {{ selectedFile.name }}
			</div>

			<div class="form-actions">
				<button
					class="btn btn-primary"
					:disabled="
						!selectedFile ||
						validating ||
						uploading ||
						validationResult !== null
					"
					@click="handleValidate"
				>
					{{ validating ? "Validating..." : "Validate CSV" }}
				</button>

				<button
					v-if="validationResult || uploadResult"
					class="btn btn-secondary"
					:disabled="validating || uploading"
					@click="startOver"
				>
					Start Over
				</button>
			</div>

			<!-- Status Message -->
			<div
				v-if="(validating || uploading) && statusMessage"
				class="status-message"
			>
				{{ statusMessage }}
			</div>
		</div>

		<!-- Validation Results Preview -->
		<div v-if="validationResult && !uploadResult" class="validation-preview">
			<h3>CSV Validation Results</h3>

			<div class="validation-summary">
				<div class="summary-stats">
					<div class="stat-card">
						<div class="stat-label">Total Rows</div>
						<div class="stat-value">{{ validationResult.totalRows }}</div>
					</div>
					<div class="stat-card stat-success">
						<div class="stat-label">Valid</div>
						<div class="stat-value">
							{{ validationResult.validRows }}
							<span class="stat-percentage">
								({{
									Math.round(
										(validationResult.validRows / validationResult.totalRows) *
											PERCENTAGE_MULTIPLIER,
									)
								}}%)
							</span>
						</div>
					</div>
					<div
						v-if="validationResult.invalidRows > NO_ERRORS"
						class="stat-card stat-error"
					>
						<div class="stat-label">Invalid</div>
						<div class="stat-value">
							{{ validationResult.invalidRows }}
							<span class="stat-percentage">
								({{
									Math.round(
										(validationResult.invalidRows /
											validationResult.totalRows) *
											PERCENTAGE_MULTIPLIER,
									)
								}}%)
							</span>
						</div>
					</div>
				</div>

				<div class="summary-breakdown">
					<div class="breakdown-item">
						<strong>New users:</strong> {{ validationResult.newUsers }}
					</div>
					<div class="breakdown-item">
						<strong>Existing users (will update):</strong>
						{{ validationResult.existingUsers }}
					</div>
				</div>
			</div>

			<!-- Warnings Section -->
			<div
				v-if="
					validationResult.warnings.length > NO_WARNINGS ||
					validationResult.invalidPoolKeys.length > NO_ITEMS
				"
				class="validation-warnings"
			>
				<h4>⚠️ Warnings</h4>
				<div
					v-if="validationResult.invalidPoolKeys.length > NO_ITEMS"
					class="warning-box"
				>
					<p><strong>Invalid pool keys found:</strong></p>
					<p class="warning-description">
						The following pool keys do not exist in the database. Users with
						these pool keys will be created, but pool assignments will be
						skipped.
					</p>
					<ul class="pool-key-list">
						<li v-for="key in validationResult.invalidPoolKeys" :key="key">
							{{ key }}
						</li>
					</ul>
				</div>
			</div>

			<!-- Errors Section -->
			<div
				v-if="validationResult.errors.length > NO_ERRORS"
				class="validation-errors"
			>
				<div class="errors-header">
					<h4>❌ Errors ({{ validationResult.errors.length }})</h4>
					<button
						class="btn btn-small"
						@click="showErrorDetails = !showErrorDetails"
					>
						{{ showErrorDetails ? "Hide Details" : "Show Details" }}
					</button>
				</div>

				<div v-if="showErrorDetails" class="error-details">
					<table class="error-table">
						<thead>
							<tr>
								<th>Row</th>
								<th>Voter ID</th>
								<th>Error</th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="(validationError, index) in validationResult.errors"
								:key="index"
							>
								<td>{{ validationError.row }}</td>
								<td>{{ validationError.voterId }}</td>
								<td>{{ validationError.error }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<!-- Confirm Import Button -->
			<div class="confirm-section">
				<div
					v-if="validationResult.validRows === NO_ERRORS"
					class="no-valid-rows"
				>
					<p>No valid rows found. Please fix the errors and try again.</p>
				</div>
				<div v-else>
					<button
						class="btn btn-primary btn-large"
						:disabled="uploading"
						@click="handleConfirmImport"
					>
						{{
							uploading
								? "Importing..."
								: `Confirm Import (${validationResult.validRows} users)`
						}}
					</button>
					<p class="confirm-note">
						This will import {{ validationResult.validRows }} valid user(s) into
						the database.
						<span v-if="validationResult.existingUsers > NO_ERRORS">
							{{ validationResult.existingUsers }} existing user(s) will be
							updated.
						</span>
					</p>
				</div>
			</div>
		</div>

		<div v-if="uploadResult" class="upload-result">
			<h3>Upload Results</h3>
			<div class="result-summary">
				<div class="result-success">
					<strong>Successfully Created:</strong> {{ uploadResult.success }}
					users
				</div>
				<div v-if="uploadResult.failed > NO_ERRORS" class="result-failed">
					<strong>Failed:</strong> {{ uploadResult.failed }} users
				</div>
			</div>

			<div v-if="uploadResult.errors.length > NO_ERRORS" class="error-list">
				<h4>Errors:</h4>
				<table class="error-table">
					<thead>
						<tr>
							<th>Row</th>
							<th>Voter ID</th>
							<th>Error</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="(uploadError, index) in uploadResult.errors"
							:key="index"
						>
							<td>{{ uploadError.row }}</td>
							<td>{{ uploadError.voterId }}</td>
							<td>{{ uploadError.error }}</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div
				v-if="
					uploadResult.warnings !== undefined &&
					uploadResult.warnings.length > NO_WARNINGS
				"
				class="warning-list"
			>
				<h4>Warnings:</h4>
				<p class="warning-description">
					The following users were created but had issues with pool assignments.
					Invalid pool keys were skipped.
				</p>
				<table class="warning-table">
					<thead>
						<tr>
							<th>Voter ID</th>
							<th>Warning</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="(uploadWarning, index) in uploadResult.warnings"
							:key="index"
						>
							<td>{{ uploadWarning.voterId }}</td>
							<td>{{ uploadWarning.warning }}</td>
						</tr>
					</tbody>
				</table>
			</div>

			<button class="btn btn-secondary" @click="goToUsers">
				Go to User List
			</button>
		</div>
	</div>
</template>

<style scoped>
.user-upload {
	max-width: 800px;
}

h2 {
	margin-bottom: 1.5rem;
	color: #2c3e50;
}

.upload-info {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	margin-bottom: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.upload-info h3 {
	margin-top: 0;
	color: #1976d2;
}

.upload-info ul {
	margin: 1rem 0;
}

.upload-info li {
	margin: 0.5rem 0;
}

.error {
	padding: 1rem;
	margin-bottom: 1rem;
	background-color: #ffebee;
	color: #c62828;
	border-radius: 4px;
}

.upload-form {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	margin-bottom: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.form-group {
	margin-bottom: 1rem;
}

.form-group label {
	display: block;
	margin-bottom: 0.5rem;
	font-weight: 500;
	color: #2c3e50;
}

.form-group input[type="file"] {
	display: block;
	width: 100%;
	padding: 0.5rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
}

.selected-file {
	margin: 1rem 0;
	padding: 0.5rem;
	background-color: #e3f2fd;
	border-radius: 4px;
	color: #1976d2;
}

.status-message {
	margin-top: 1rem;
	padding: 0.75rem 1rem;
	background-color: #e3f2fd;
	border-radius: 4px;
	color: #1976d2;
	font-size: 0.9rem;
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

.upload-result {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.upload-result h3 {
	margin-top: 0;
	color: #2c3e50;
}

.result-summary {
	margin: 1rem 0;
}

.result-success {
	color: #2e7d32;
	font-size: 1.125rem;
	margin-bottom: 0.5rem;
}

.result-failed {
	color: #c62828;
	font-size: 1.125rem;
	margin-bottom: 0.5rem;
}

.error-list {
	margin: 1.5rem 0;
}

.error-list h4 {
	color: #c62828;
	margin-bottom: 1rem;
}

.error-table {
	width: 100%;
	border-collapse: collapse;
	margin-bottom: 1.5rem;
}

.error-table th,
.error-table td {
	padding: 0.75rem;
	text-align: left;
	border-bottom: 1px solid #e0e0e0;
}

.error-table th {
	background-color: #f5f5f5;
	font-weight: 600;
	color: #2c3e50;
}

.warning-list {
	margin: 1.5rem 0;
}

.warning-list h4 {
	color: #f57c00;
	margin-bottom: 0.5rem;
}

.warning-description {
	color: #666;
	font-size: 0.9rem;
	margin-bottom: 1rem;
}

.warning-table {
	width: 100%;
	border-collapse: collapse;
	margin-bottom: 1.5rem;
}

.warning-table th,
.warning-table td {
	padding: 0.75rem;
	text-align: left;
	border-bottom: 1px solid #ffe0b2;
}

.warning-table th {
	background-color: #fff3e0;
	font-weight: 600;
	color: #e65100;
}

.warning-table tr:hover {
	background-color: #fff8e1;
}

.download-template {
	display: inline-block;
	padding: 0.5rem 1rem;
	background-color: #4caf50;
	color: white;
	text-decoration: none;
	border-radius: 4px;
	font-weight: 500;
	transition: background-color 0.2s;
}

.download-template:hover {
	background-color: #388e3c;
}

.form-actions {
	display: flex;
	gap: 1rem;
	align-items: center;
}

.validation-preview {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	margin-bottom: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.validation-preview h3 {
	margin-top: 0;
	color: #2c3e50;
	margin-bottom: 1.5rem;
}

.validation-summary {
	margin-bottom: 2rem;
}

.summary-stats {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	gap: 1rem;
	margin-bottom: 1.5rem;
}

.stat-card {
	background: #f5f5f5;
	padding: 1rem;
	border-radius: 8px;
	text-align: center;
	border: 2px solid #e0e0e0;
}

.stat-card.stat-success {
	background: #e8f5e9;
	border-color: #4caf50;
}

.stat-card.stat-error {
	background: #ffebee;
	border-color: #f44336;
}

.stat-label {
	font-size: 0.875rem;
	color: #666;
	text-transform: uppercase;
	margin-bottom: 0.5rem;
	font-weight: 500;
}

.stat-value {
	font-size: 2rem;
	font-weight: 700;
	color: #2c3e50;
}

.stat-percentage {
	font-size: 1rem;
	color: #666;
	font-weight: 400;
}

.summary-breakdown {
	background: #f8f9fa;
	padding: 1rem;
	border-radius: 4px;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.breakdown-item {
	font-size: 0.9375rem;
	color: #2c3e50;
}

.validation-warnings {
	margin-bottom: 2rem;
	padding: 1rem;
	background: #fff3e0;
	border-left: 4px solid #ff9800;
	border-radius: 4px;
}

.validation-warnings h4 {
	margin-top: 0;
	color: #e65100;
}

.warning-box {
	margin-top: 1rem;
}

.warning-description {
	font-size: 0.875rem;
	color: #5d4037;
	margin: 0.5rem 0;
}

.pool-key-list {
	list-style: none;
	padding: 0;
	margin: 0.5rem 0;
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
}

.pool-key-list li {
	background: #ffe0b2;
	padding: 0.25rem 0.75rem;
	border-radius: 4px;
	font-family: monospace;
	font-size: 0.875rem;
	color: #e65100;
}

.validation-errors {
	margin-bottom: 2rem;
	padding: 1rem;
	background: #ffebee;
	border-left: 4px solid #f44336;
	border-radius: 4px;
}

.errors-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1rem;
}

.validation-errors h4 {
	margin: 0;
	color: #c62828;
}

.btn-small {
	padding: 0.375rem 0.75rem;
	font-size: 0.875rem;
}

.error-details {
	margin-top: 1rem;
	max-height: 400px;
	overflow-y: auto;
}

.confirm-section {
	border-top: 2px solid #e0e0e0;
	padding-top: 2rem;
	text-align: center;
}

.btn-large {
	padding: 1rem 2rem;
	font-size: 1.125rem;
}

.confirm-note {
	margin-top: 1rem;
	color: #666;
	font-size: 0.9375rem;
}

.no-valid-rows {
	padding: 1.5rem;
	background: #fff3e0;
	border-radius: 4px;
	color: #e65100;
	font-weight: 500;
}
</style>
