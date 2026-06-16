<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
	getCurrentMeetingForWatcher,
	getWatcherMeetingReport,
	leaveMeetingAsWatcher,
} from "../../services/api";
import { useKioskMode } from "../../composables/useKioskMode";
import type {
	CurrentMeetingInfo,
	WatcherMeetingReport,
} from "@mcdc-convention-voting/shared";

const router = useRouter();
const { getKioskModeQueryParam } = useKioskMode();

const currentMeetingInfo = ref<CurrentMeetingInfo | null>(null);
const meetingReport = ref<WatcherMeetingReport | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const isLeavingMeeting = ref(false);

/**
 * Load the current meeting the watcher has joined
 */
async function loadCurrentMeeting(): Promise<void> {
	loading.value = true;
	error.value = null;

	try {
		// First get the current meeting info
		const currentResponse = await getCurrentMeetingForWatcher();
		if (
			!currentResponse.success ||
			currentResponse.data === undefined ||
			currentResponse.data === null
		) {
			// No meeting joined - layout will handle redirect
			currentMeetingInfo.value = null;
			return;
		}

		currentMeetingInfo.value = currentResponse.data;

		// Now load the detailed meeting report for this meeting
		const reportResponse = await getWatcherMeetingReport(
			currentResponse.data.meeting.id,
		);
		if (reportResponse.success && reportResponse.data !== undefined) {
			meetingReport.value = reportResponse.data;
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load meeting";
	} finally {
		loading.value = false;
	}
}

/**
 * Leave current meeting and return to meeting selection
 */
async function handleChangeMeeting(): Promise<void> {
	isLeavingMeeting.value = true;
	try {
		await leaveMeetingAsWatcher();
		const kioskQuery = getKioskModeQueryParam();
		await router.push({
			path: "/watcher/meeting-selection",
			query: kioskQuery,
		});
	} catch {
		// Still redirect on error
		const kioskQuery = getKioskModeQueryParam();
		await router.push({
			path: "/watcher/meeting-selection",
			query: kioskQuery,
		});
	} finally {
		isLeavingMeeting.value = false;
	}
}

function viewMeetingDetails(): void {
	if (currentMeetingInfo.value === null) return;
	void router.push(`/watcher/meetings/${currentMeetingInfo.value.meeting.id}`);
}

function viewQuorum(): void {
	if (currentMeetingInfo.value === null) return;
	void router.push(
		`/watcher/meetings/${currentMeetingInfo.value.meeting.id}/quorum`,
	);
}

function formatDate(date: Date | string): string {
	return new Date(date).toLocaleString();
}

onMounted(() => {
	void loadCurrentMeeting();
});
</script>

<template>
	<div class="meeting-list">
		<div class="header">
			<h2>Current Meeting</h2>
			<button
				class="btn btn-change"
				:disabled="isLeavingMeeting"
				@click="handleChangeMeeting"
			>
				{{ isLeavingMeeting ? "Leaving..." : "Change Meeting" }}
			</button>
		</div>

		<div v-if="error !== null" class="error">
			{{ error }}
		</div>

		<div v-if="loading" class="loading">Loading meeting...</div>

		<div v-else-if="meetingReport === null" class="empty">
			No meeting selected. Please select a meeting to observe.
		</div>

		<div v-else class="meeting-card">
			<div class="meeting-header">
				<h3>{{ meetingReport.meetingName }}</h3>
				<p v-if="meetingReport.description" class="description">
					{{ meetingReport.description }}
				</p>
			</div>

			<div class="meeting-details">
				<div class="detail-row">
					<span class="detail-label">Start Date:</span>
					<span class="detail-value">{{
						formatDate(meetingReport.startDate)
					}}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">End Date:</span>
					<span class="detail-value">{{
						formatDate(meetingReport.endDate)
					}}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">Quorum Pool:</span>
					<span class="detail-value">{{ meetingReport.quorumPoolName }}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">Quorum Status:</span>
					<span class="detail-value">
						<span
							v-if="meetingReport.quorumCalledAt !== null"
							class="status-badge called"
						>
							Called
						</span>
						<span v-else class="status-badge not-called">Not Called</span>
					</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">Motions:</span>
					<span class="detail-value">{{
						meetingReport.motionSummaries.length
					}}</span>
				</div>
			</div>

			<div class="meeting-actions">
				<button class="btn btn-primary" @click="viewMeetingDetails">
					View Details
				</button>
				<button class="btn btn-secondary" @click="viewQuorum">
					View Quorum
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.meeting-list {
	max-width: 800px;
	margin: 0 auto;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1.5rem;
}

.header h2 {
	margin: 0;
	color: #2c3e50;
}

.error {
	background-color: #fee;
	color: #c33;
	padding: 1rem;
	border-radius: 4px;
	margin-bottom: 1rem;
}

.loading {
	text-align: center;
	padding: 2rem;
	color: #666;
}

.empty {
	text-align: center;
	padding: 3rem;
	color: #666;
	background-color: white;
	border-radius: 8px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.meeting-card {
	background-color: white;
	border-radius: 8px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	padding: 1.5rem;
}

.meeting-header {
	border-bottom: 1px solid #e0e0e0;
	padding-bottom: 1rem;
	margin-bottom: 1rem;
}

.meeting-header h3 {
	margin: 0 0 0.5rem 0;
	color: #2c3e50;
	font-size: 1.25rem;
}

.meeting-header .description {
	margin: 0;
	color: #666;
	font-size: 0.9rem;
}

.meeting-details {
	margin-bottom: 1.5rem;
}

.detail-row {
	display: flex;
	padding: 0.5rem 0;
	border-bottom: 1px solid #f0f0f0;
}

.detail-row:last-child {
	border-bottom: none;
}

.detail-label {
	font-weight: 500;
	color: #666;
	min-width: 120px;
}

.detail-value {
	color: #2c3e50;
}

.status-badge {
	display: inline-block;
	padding: 0.25rem 0.75rem;
	border-radius: 20px;
	font-weight: 500;
	font-size: 0.75rem;
}

.status-badge.called {
	background: #c8e6c9;
	color: #2e7d32;
}

.status-badge.not-called {
	background: #fff3e0;
	color: #ef6c00;
}

.meeting-actions {
	display: flex;
	gap: 0.75rem;
	flex-wrap: wrap;
}

.btn {
	padding: 0.625rem 1.25rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.875rem;
	font-weight: 500;
	text-decoration: none;
	display: inline-block;
	transition: all 0.2s;
}

.btn-primary {
	background-color: #34495e;
	color: white;
}

.btn-primary:hover {
	background-color: #2c3e50;
}

.btn-secondary {
	background-color: #6c757d;
	color: white;
}

.btn-secondary:hover {
	background-color: #5a6268;
}

.btn-change {
	background-color: transparent;
	color: #34495e;
	border: 1px solid #34495e;
}

.btn-change:hover:not(:disabled) {
	background-color: #34495e;
	color: white;
}

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

@media (max-width: 600px) {
	.header {
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
	}

	.detail-row {
		flex-direction: column;
		gap: 0.25rem;
	}

	.detail-label {
		min-width: auto;
	}

	.meeting-actions {
		flex-direction: column;
	}

	.meeting-actions .btn {
		width: 100%;
		text-align: center;
	}
}
</style>
