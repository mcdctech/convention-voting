<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { uploadUsersCSV } from "../../services/api";

const router = useRouter();

// Constants
const NO_FILES = 0;

const NO_ERRORS = 0;

const selectedFile = ref<File | null>(null);
const uploading = ref(false);
const error = ref<string | null>(null);
const uploadResult = ref<{
	success: number;
	failed: number;
	errors: Array<{ row: number; voterId: string; error: string }>;
} | null>(null);

function handleFileSelect(event: Event): void {
	if (!(event.target instanceof HTMLInputElement)) {
		return;
	}
	const { target } = event;
	const { files } = target;
	if (files !== null && files.length > NO_FILES) {
		const [file] = files;
		selectedFile.value = file;
		uploadResult.value = null;
	}
}

async function handleUpload(): Promise<void> {
	if (selectedFile.value === null) {
		return;
	}

	uploading.value = true;
	uploadResult.value = null;
	error.value = null;

	try {
		const response = await uploadUsersCSV(selectedFile.value);
		if (response.data !== undefined) {
			const { data } = response;
			uploadResult.value = data;
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to upload CSV";
	} finally {
		uploading.value = false;
	}
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
			<p>The CSV file must contain the following columns:</p>
			<ul>
				<li><strong>voter_id</strong> - Unique identifier for the voter</li>
				<li><strong>first_name</strong> - Voter's first name</li>
				<li><strong>last_name</strong> - Voter's last name</li>
				<li>
					<strong>user_type</strong> (optional) - User role: "voter" (default),
					"admin", or "watcher"
				</li>
				<li>
					<strong>pool_key_1</strong> through <strong>pool_key_10</strong>
					(optional) - Pool keys to assign the user to (up to 10 pools)
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
					@change="handleFileSelect"
				/>
			</div>

			<div v-if="selectedFile" class="selected-file">
				Selected: {{ selectedFile.name }}
			</div>

			<button
				class="btn btn-primary"
				:disabled="!selectedFile || uploading"
				@click="handleUpload"
			>
				{{ uploading ? "Uploading..." : "Upload CSV" }}
			</button>
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
</style>
