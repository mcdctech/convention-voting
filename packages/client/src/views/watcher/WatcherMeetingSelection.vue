<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../../composables/useAuth";
import {
	getJoinableMeetingsForWatcher,
	joinMeetingAsWatcher,
} from "../../services/api";
import type { JoinableMeeting } from "@mcdc-convention-voting/shared";

const { currentUser } = useAuth();
const router = useRouter();

const meetings = ref<JoinableMeeting[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const joiningMeetingId = ref<number | null>(null);

async function loadJoinableMeetings(): Promise<void> {
	try {
		const response = await getJoinableMeetingsForWatcher();
		if (response.success && response.data !== undefined) {
			meetings.value = response.data;
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

async function handleJoinMeeting(meetingId: number): Promise<void> {
	joiningMeetingId.value = meetingId;
	error.value = null;

	try {
		const response = await joinMeetingAsWatcher(meetingId);
		if (response.success) {
			// Navigate to watcher dashboard
			void router.push("/watcher");
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

function retryLoad(): void {
	loading.value = true;
	error.value = null;
	void loadJoinableMeetings();
}

onMounted((): void => {
	void loadJoinableMeetings();
});
</script>

<template>
	<div class="meeting-selection">
		<div class="welcome-section">
			<h2>Welcome, {{ currentUser?.firstName }}!</h2>
			<p>Please select a meeting to observe.</p>
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

			<div v-else-if="meetings.length === 0" class="empty-state">
				<p>No meetings are currently available for you to observe.</p>
				<p class="hint">
					Please wait for a meeting to become active, or contact an
					administrator if you believe this is an error.
				</p>
			</div>

			<div v-else class="meetings-list">
				<div v-for="meeting in meetings" :key="meeting.id" class="meeting-card">
					<div class="meeting-info">
						<h4>{{ meeting.name }}</h4>
						<p v-if="meeting.description" class="description">
							{{ meeting.description }}
						</p>
						<div class="meeting-meta">
							<span class="pool-badge watcher-badge">Observer Access</span>
							<span class="date-range">
								{{ formatDate(meeting.startDate) }} -
								{{ formatDate(meeting.endDate) }}
							</span>
						</div>
					</div>
					<button
						class="btn btn-primary join-btn"
						:disabled="joiningMeetingId !== null"
						@click="handleJoinMeeting(meeting.id)"
					>
						<span v-if="joiningMeetingId === meeting.id">Joining...</span>
						<span v-else>Observe Meeting</span>
					</button>
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
	margin-bottom: 2rem;
}

.welcome-section h2 {
	margin: 0 0 0.5rem 0;
	color: #2c3e50;
}

.welcome-section p {
	margin: 0;
	color: #666;
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
	border-bottom: 2px solid #6c757d;
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
	align-items: center;
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

.watcher-badge {
	background: #f3e5f5;
	color: #7b1fa2;
}

.date-range {
	color: #999;
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
	background-color: #6c757d;
	color: white;
}

.btn-primary:hover:not(:disabled) {
	background-color: #5a6268;
}

.btn-primary:disabled {
	background-color: #ccc;
	cursor: not-allowed;
}

.join-btn {
	flex-shrink: 0;
	margin-left: 1rem;
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
}
</style>
