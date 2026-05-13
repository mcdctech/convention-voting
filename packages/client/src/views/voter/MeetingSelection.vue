<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
	DOCUMENT_CATEGORY_LABELS,
	type DocumentCategory,
	type JoinableMeeting,
	type MeetingDocument,
} from "@mcdc-convention-voting/shared";
import { useAuth } from "../../composables/useAuth";
import {
	getJoinableMeetings,
	getUpcomingMeetings,
	joinMeeting,
	getMeetingDocuments,
	getUserGuide,
	getDocumentDownloadUrl,
	getUserGuideDownloadUrl,
} from "../../services/api";

const { currentUser } = useAuth();
const router = useRouter();

const meetings = ref<JoinableMeeting[]>([]);
const upcomingMeetings = ref<JoinableMeeting[]>([]);
const meetingDocuments = ref<Map<number, MeetingDocument[]>>(new Map());
const userGuide = ref<MeetingDocument | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const joiningMeetingId = ref<number | null>(null);

// Sort active meetings by start date
const sortedMeetings = computed(() =>
	[...meetings.value].sort((a, b) => {
		const dateA = new Date(a.startDate).getTime();
		const dateB = new Date(b.startDate).getTime();
		return dateA - dateB;
	}),
);

// Sort upcoming meetings by start date (soonest first)
const sortedUpcomingMeetings = computed(() =>
	[...upcomingMeetings.value].sort((a, b) => {
		const dateA = new Date(a.startDate).getTime();
		const dateB = new Date(b.startDate).getTime();
		return dateA - dateB;
	}),
);

async function loadJoinableMeetings(): Promise<void> {
	try {
		const response = await getJoinableMeetings();
		if (response.success && response.data !== undefined) {
			meetings.value = response.data;

			// Load documents for active meetings
			await Promise.all(
				response.data.map(async (meeting) => {
					try {
						const docsResponse = await getMeetingDocuments(meeting.id);
						if (docsResponse.success && docsResponse.data !== undefined) {
							meetingDocuments.value.set(meeting.id, docsResponse.data);
						}
					} catch {
						// Silently ignore document loading errors per meeting
					}
				}),
			);
		} else {
			error.value = response.error ?? "Failed to load meetings";
		}
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to load meetings";
	} finally {
		loading.value = false;
	}
}

async function loadUpcomingMeetings(): Promise<void> {
	try {
		const response = await getUpcomingMeetings();
		if (response.success && response.data !== undefined) {
			upcomingMeetings.value = response.data;

			// Load documents for upcoming meetings
			await Promise.all(
				response.data.map(async (meeting) => {
					try {
						const docsResponse = await getMeetingDocuments(meeting.id);
						if (docsResponse.success && docsResponse.data !== undefined) {
							meetingDocuments.value.set(meeting.id, docsResponse.data);
						}
					} catch {
						// Silently ignore document loading errors per meeting
					}
				}),
			);
		}
	} catch {
		// Silently ignore upcoming meetings loading errors
	}
}

async function loadUserGuide(): Promise<void> {
	try {
		const response = await getUserGuide();
		if (response.success && response.data !== undefined) {
			userGuide.value = response.data;
		}
	} catch {
		// Silently ignore user guide loading errors
	}
}

async function handleJoinMeeting(meetingId: number): Promise<void> {
	joiningMeetingId.value = meetingId;
	error.value = null;

	try {
		const response = await joinMeeting(meetingId);
		if (response.success) {
			// Navigate to voter dashboard
			void router.push("/");
		} else {
			error.value = response.error ?? "Failed to join meeting";
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to join meeting";
	} finally {
		joiningMeetingId.value = null;
	}
}

function formatDate(date: Date): string {
	return new Date(date).toLocaleString();
}

function getDocumentsForMeeting(meetingId: number): MeetingDocument[] {
	return meetingDocuments.value.get(meetingId) ?? [];
}

function getCategoryLabel(category: DocumentCategory): string {
	return DOCUMENT_CATEGORY_LABELS[category];
}

function downloadDocument(doc: MeetingDocument): void {
	window.open(getDocumentDownloadUrl(doc.id), "_blank");
}

function downloadUserGuide(): void {
	window.open(getUserGuideDownloadUrl(), "_blank");
}

function retryLoad(): void {
	loading.value = true;
	error.value = null;
	void loadJoinableMeetings();
}

onMounted((): void => {
	void loadJoinableMeetings();
	void loadUpcomingMeetings();
	void loadUserGuide();
});
</script>

<template>
	<div class="meeting-selection">
		<div class="welcome-section">
			<h2>Welcome, {{ currentUser?.firstName }}!</h2>
			<p>Please select a meeting to join.</p>
		</div>

		<!-- User Guide Link -->
		<div v-if="userGuide !== null" class="user-guide-section">
			<button class="btn btn-link user-guide-btn" @click="downloadUserGuide">
				<span class="guide-icon">📖</span>
				Download User Guide
			</button>
		</div>

		<section class="selection-section">
			<h3>Available Meetings</h3>

			<div v-if="loading" class="loading-state">
				<p>Loading available meetings...</p>
			</div>

			<div v-else-if="error !== null" class="error-state">
				<p>{{ error }}</p>
				<button class="btn btn-primary" @click="retryLoad">Retry</button>
			</div>

			<div v-else-if="sortedMeetings.length === 0" class="empty-state">
				<p>No meetings are currently available for you to join.</p>
				<p class="hint">
					Please wait for a meeting to become active, or contact an
					administrator if you believe this is an error.
				</p>
			</div>

			<div v-else class="meetings-list">
				<div
					v-for="meeting in sortedMeetings"
					:key="meeting.id"
					class="meeting-card"
				>
					<div class="meeting-info">
						<h4>{{ meeting.name }}</h4>
						<p v-if="meeting.description" class="description">
							{{ meeting.description }}
						</p>
						<div class="meeting-meta">
							<span class="pool-badge">{{ meeting.quorumVotingPoolName }}</span>
							<span class="date-range">
								{{ formatDate(meeting.startDate) }} -
								{{ formatDate(meeting.endDate) }}
							</span>
						</div>

						<!-- Meeting Documents -->
						<div
							v-if="getDocumentsForMeeting(meeting.id).length > 0"
							class="meeting-documents"
						>
							<span class="docs-label">Documents:</span>
							<div class="docs-list">
								<button
									v-for="doc in getDocumentsForMeeting(meeting.id)"
									:key="doc.id"
									class="doc-link"
									@click="downloadDocument(doc)"
								>
									{{ getCategoryLabel(doc.category) }}
								</button>
							</div>
						</div>
					</div>
					<button
						class="btn btn-primary join-btn"
						:disabled="joiningMeetingId !== null"
						@click="handleJoinMeeting(meeting.id)"
					>
						<span v-if="joiningMeetingId === meeting.id">Joining...</span>
						<span v-else>Join Meeting</span>
					</button>
				</div>
			</div>
		</section>

		<!-- Upcoming Meetings Section -->
		<section
			v-if="!loading && sortedUpcomingMeetings.length > 0"
			class="selection-section upcoming-section"
		>
			<h3>Upcoming Meetings</h3>

			<div class="meetings-list">
				<div
					v-for="meeting in sortedUpcomingMeetings"
					:key="meeting.id"
					class="meeting-card upcoming-card"
				>
					<div class="meeting-info">
						<h4>{{ meeting.name }}</h4>
						<p v-if="meeting.description" class="description">
							{{ meeting.description }}
						</p>
						<div class="meeting-meta">
							<span class="pool-badge">{{ meeting.quorumVotingPoolName }}</span>
						</div>
						<div class="upcoming-schedule">
							<div class="schedule-row">
								<span class="schedule-label">Starts:</span>
								<span class="schedule-value">{{
									formatDate(meeting.startDate)
								}}</span>
							</div>
							<div class="schedule-row">
								<span class="schedule-label">Ends:</span>
								<span class="schedule-value">{{
									formatDate(meeting.endDate)
								}}</span>
							</div>
						</div>

						<!-- Meeting Documents -->
						<div
							v-if="getDocumentsForMeeting(meeting.id).length > 0"
							class="meeting-documents"
						>
							<span class="docs-label">Documents:</span>
							<div class="docs-list">
								<button
									v-for="doc in getDocumentsForMeeting(meeting.id)"
									:key="doc.id"
									class="doc-link"
									@click="downloadDocument(doc)"
								>
									{{ getCategoryLabel(doc.category) }}
								</button>
							</div>
						</div>
					</div>
					<div class="upcoming-status">
						<span class="status-badge">Not Yet Started</span>
					</div>
				</div>
			</div>
		</section>
	</div>
</template>

<style scoped>
.meeting-selection {
	max-width: 800px;
}

.welcome-section {
	margin-bottom: 1rem;
}

.welcome-section h2 {
	margin: 0 0 0.5rem 0;
	color: #2c3e50;
}

.welcome-section p {
	margin: 0;
	color: #666;
}

.user-guide-section {
	margin-bottom: 1.5rem;
}

.user-guide-btn {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	background: #f8f9fa;
	border: 1px solid #dee2e6;
	padding: 0.5rem 1rem;
	border-radius: 6px;
	color: #007bff;
	font-weight: 500;
	cursor: pointer;
	transition: background-color 0.2s;
}

.user-guide-btn:hover {
	background: #e9ecef;
}

.guide-icon {
	font-size: 1.1rem;
}

.selection-section {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.selection-section h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
	font-size: 1.25rem;
	border-bottom: 2px solid #007bff;
	padding-bottom: 0.5rem;
}

.loading-state {
	text-align: center;
	padding: 2rem;
	color: #666;
}

.error-state {
	text-align: center;
	padding: 2rem;
	color: #dc3545;
}

.error-state p {
	margin: 0 0 1rem 0;
}

.empty-state {
	text-align: center;
	padding: 2rem;
	color: #666;
}

.empty-state p {
	margin: 0 0 0.5rem 0;
}

.empty-state .hint {
	font-size: 0.875rem;
	color: #999;
}

.meetings-list {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.meeting-card {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	padding: 1rem;
	border: 1px solid #e0e0e0;
	border-radius: 8px;
	background: #fafafa;
}

.meeting-info {
	flex: 1;
}

.meeting-info h4 {
	margin: 0 0 0.5rem 0;
	color: #2c3e50;
}

.meeting-info .description {
	margin: 0 0 0.5rem 0;
	color: #666;
	font-size: 0.9rem;
}

.meeting-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	align-items: center;
	font-size: 0.85rem;
}

.pool-badge {
	background: #e3f2fd;
	color: #1565c0;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-weight: 500;
}

.date-range {
	color: #999;
}

.meeting-documents {
	margin-top: 0.75rem;
	padding-top: 0.75rem;
	border-top: 1px solid #e0e0e0;
}

.docs-label {
	font-size: 0.8rem;
	color: #666;
	font-weight: 500;
	margin-right: 0.5rem;
}

.docs-list {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	margin-top: 0.25rem;
}

.doc-link {
	background: #e8f5e9;
	color: #2e7d32;
	border: none;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-size: 0.8rem;
	cursor: pointer;
	transition: background-color 0.2s;
}

.doc-link:hover {
	background: #c8e6c9;
}

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.9rem;
	font-weight: 500;
	transition: background-color 0.2s;
}

.btn-primary {
	background-color: #007bff;
	color: white;
}

.btn-primary:hover:not(:disabled) {
	background-color: #0056b3;
}

.btn-primary:disabled {
	background-color: #ccc;
	cursor: not-allowed;
}

.btn-link {
	background: none;
	color: #007bff;
	text-decoration: none;
}

.btn-link:hover {
	text-decoration: underline;
}

.join-btn {
	flex-shrink: 0;
	margin-left: 1rem;
	align-self: center;
}

/* Upcoming meetings section */
.upcoming-section {
	margin-top: 1.5rem;
}

.upcoming-section h3 {
	border-bottom-color: #6c757d;
}

.upcoming-card {
	background: #f8f9fa;
	border-color: #dee2e6;
}

.upcoming-schedule {
	margin-top: 0.75rem;
	padding: 0.5rem;
	background: #fff;
	border-radius: 4px;
	border: 1px solid #e0e0e0;
}

.schedule-row {
	display: flex;
	gap: 0.5rem;
	font-size: 0.875rem;
}

.schedule-row + .schedule-row {
	margin-top: 0.25rem;
}

.schedule-label {
	color: #666;
	font-weight: 500;
	min-width: 50px;
}

.schedule-value {
	color: #2c3e50;
}

.upcoming-status {
	flex-shrink: 0;
	margin-left: 1rem;
	align-self: center;
}

.status-badge {
	display: inline-block;
	padding: 0.375rem 0.75rem;
	background: #6c757d;
	color: white;
	border-radius: 4px;
	font-size: 0.8rem;
	font-weight: 500;
}

@media (max-width: 600px) {
	.meeting-card {
		flex-direction: column;
		align-items: stretch;
	}

	.join-btn {
		margin-left: 0;
		margin-top: 1rem;
	}

	.upcoming-status {
		margin-left: 0;
		margin-top: 1rem;
		text-align: center;
	}
}
</style>
