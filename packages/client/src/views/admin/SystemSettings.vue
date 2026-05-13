<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
	getAdminUserGuide,
	uploadUserGuide,
	deleteDocument,
	getDocumentDownloadUrl,
} from "../../services/api";
import type { MeetingDocument } from "@mcdc-convention-voting/shared";

// Constants
const EMPTY_STRING = "";

// State
const userGuide = ref<MeetingDocument | null>(null);
const loading = ref(true);
const uploading = ref(false);
const deleting = ref(false);
const error = ref<string | null>(null);

async function loadUserGuide(): Promise<void> {
	loading.value = true;
	error.value = null;
	try {
		const response = await getAdminUserGuide();
		if (response.success && response.data !== undefined) {
			userGuide.value = response.data;
		} else {
			userGuide.value = null;
		}
	} catch {
		// No user guide exists yet, which is fine
		userGuide.value = null;
	} finally {
		loading.value = false;
	}
}

async function handleUpload(event: Event): Promise<void> {
	if (!(event.target instanceof HTMLInputElement)) {
		return;
	}
	const inputElement = event.target;
	const { files } = inputElement;
	const NO_FILES = 0;
	if (files === null || files.length === NO_FILES) {
		return;
	}
	const [file] = files;

	uploading.value = true;
	error.value = null;

	try {
		const response = await uploadUserGuide(file);
		if (response.success && response.data !== undefined) {
			userGuide.value = response.data;
		}
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to upload user guide";
	} finally {
		uploading.value = false;
		inputElement.value = EMPTY_STRING;
	}
}

async function handleDelete(): Promise<void> {
	if (userGuide.value === null) return;

	deleting.value = true;
	error.value = null;

	try {
		await deleteDocument(userGuide.value.id);
		userGuide.value = null;
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to delete user guide";
	} finally {
		deleting.value = false;
	}
}

function handleDownload(): void {
	if (userGuide.value === null) return;
	window.open(getDocumentDownloadUrl(userGuide.value.id), "_blank");
}

onMounted(() => {
	void loadUserGuide();
});
</script>

<template>
	<div class="system-settings">
		<h2>System Settings</h2>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<section class="settings-section">
			<h3>User Guide</h3>
			<p class="section-description">
				Upload a PDF user guide that will be available to all voters and
				watchers from their meeting selection page.
			</p>

			<div v-if="loading" class="loading">Loading...</div>

			<div v-else class="user-guide-content">
				<div v-if="userGuide" class="current-guide">
					<div class="guide-info">
						<span class="guide-label">Current User Guide:</span>
						<span class="guide-filename">{{ userGuide.originalFilename }}</span>
					</div>
					<div class="guide-actions">
						<button class="btn btn-link" @click="handleDownload">
							Download
						</button>
						<button
							class="btn btn-danger"
							:disabled="deleting"
							@click="handleDelete"
						>
							{{ deleting ? "Deleting..." : "Delete" }}
						</button>
					</div>
				</div>

				<div class="upload-section">
					<label for="user-guide-upload" class="upload-label">
						{{ userGuide ? "Replace User Guide" : "Upload User Guide" }}
					</label>
					<input
						id="user-guide-upload"
						type="file"
						accept=".pdf,application/pdf"
						:disabled="uploading"
						@change="handleUpload"
					/>
					<span v-if="uploading" class="upload-status">Uploading...</span>
				</div>
			</div>
		</section>
	</div>
</template>

<style scoped>
.system-settings {
	max-width: 800px;
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

.settings-section {
	background: white;
	border-radius: 8px;
	padding: 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	margin-bottom: 2rem;
}

.settings-section h3 {
	margin: 0 0 0.5rem 0;
	color: #2c3e50;
	font-size: 1.25rem;
}

.section-description {
	margin: 0 0 1.5rem 0;
	color: #666;
	font-size: 0.9rem;
}

.loading {
	text-align: center;
	padding: 2rem;
	color: #666;
}

.user-guide-content {
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
}

.current-guide {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 1rem;
	background: #e8f5e9;
	border-radius: 8px;
	flex-wrap: wrap;
	gap: 1rem;
}

.guide-info {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.guide-label {
	font-size: 0.8rem;
	color: #666;
	font-weight: 500;
}

.guide-filename {
	color: #2e7d32;
	font-weight: 500;
	word-break: break-all;
}

.guide-actions {
	display: flex;
	gap: 0.5rem;
}

.upload-section {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.upload-label {
	font-weight: 500;
	color: #2c3e50;
	font-size: 0.9rem;
}

.upload-status {
	font-size: 0.875rem;
	color: #1976d2;
}

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.875rem;
	font-weight: 500;
	transition: background-color 0.2s;
}

.btn:disabled {
	cursor: not-allowed;
	opacity: 0.6;
}

.btn-link {
	background: none;
	color: #1976d2;
	padding: 0.5rem;
}

.btn-link:hover {
	text-decoration: underline;
	background: #e3f2fd;
}

.btn-danger {
	background-color: #dc3545;
	color: white;
}

.btn-danger:hover:not(:disabled) {
	background-color: #c82333;
}

@media (max-width: 600px) {
	.current-guide {
		flex-direction: column;
		align-items: flex-start;
	}
}
</style>
