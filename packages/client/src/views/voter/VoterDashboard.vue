<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../../composables/useAuth";
import {
	getOpenMotions,
	getCurrentMeeting,
	leaveMeeting,
} from "../../services/api";
import MotionCard from "../../components/MotionCard.vue";
import type {
	OpenMotionForVoter,
	CurrentMeetingInfo,
} from "@mcdc-convention-voting/shared";

const { currentUser } = useAuth();
const router = useRouter();

// Polling interval: 30 seconds
const POLL_INTERVAL_MS = 30000;

const motions = ref<OpenMotionForVoter[]>([]);
const currentMeetingInfo = ref<CurrentMeetingInfo | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const leavingMeeting = ref(false);
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

const currentMeetingName = computed(
	(): string => currentMeetingInfo.value?.meeting.name ?? "Unknown Meeting",
);

async function loadCurrentMeeting(): Promise<void> {
	try {
		const response = await getCurrentMeeting();
		if (response.success && response.data !== undefined) {
			currentMeetingInfo.value = response.data;
		}
	} catch {
		// Silently fail - will redirect via VoterLayout if no meeting
	}
}

async function loadOpenMotions(): Promise<void> {
	try {
		const response = await getOpenMotions();
		motions.value = response.data;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load motions";
	} finally {
		loading.value = false;
	}
}

async function handleLeaveMeeting(): Promise<void> {
	leavingMeeting.value = true;
	try {
		const response = await leaveMeeting();
		if (response.success) {
			// Navigate to meeting selection
			void router.push("/meetings");
		} else {
			error.value = response.error ?? "Failed to leave meeting";
		}
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to leave meeting";
	} finally {
		leavingMeeting.value = false;
	}
}

function navigateToMotion(motionId: number): void {
	void router.push(`/motion/${String(motionId)}`);
}

function retryLoad(): void {
	loading.value = true;
	error.value = null;
	void loadOpenMotions();
}

onMounted((): void => {
	void loadCurrentMeeting();
	void loadOpenMotions();
	// Set up polling for updates
	pollIntervalId = setInterval((): void => {
		void loadOpenMotions();
	}, POLL_INTERVAL_MS);
});

onUnmounted((): void => {
	if (pollIntervalId !== null) {
		clearInterval(pollIntervalId);
	}
});
</script>

<template>
	<div class="voter-dashboard">
		<div class="welcome-section">
			<h2>Welcome, {{ currentUser?.firstName }}!</h2>
			<p>
				You can view and participate in active meetings from this dashboard.
			</p>
		</div>

		<!-- Current Meeting Info -->
		<section v-if="currentMeetingInfo !== null" class="meeting-section">
			<div class="meeting-header">
				<div class="meeting-info">
					<span class="meeting-label">Current Meeting:</span>
					<span class="meeting-name">{{ currentMeetingName }}</span>
				</div>
				<button
					class="btn btn-secondary"
					:disabled="leavingMeeting"
					@click="handleLeaveMeeting"
				>
					{{ leavingMeeting ? "Leaving..." : "Leave Meeting" }}
				</button>
			</div>
		</section>

		<section class="dashboard-section">
			<h3>Active Motions</h3>

			<div v-if="loading" class="loading-state">
				<p>Loading open motions...</p>
			</div>

			<div v-else-if="error !== null" class="error-state">
				<p>{{ error }}</p>
				<button class="btn btn-primary" @click="retryLoad">Retry</button>
			</div>

			<div v-else-if="motions.length === 0" class="empty-state">
				<p>No active motions requiring your vote.</p>
				<p class="hint">
					When a motion is open for voting, it will appear here.
				</p>
			</div>

			<div v-else class="motions-grid">
				<MotionCard
					v-for="motion in motions"
					:key="motion.id"
					:motion="motion"
					@click="navigateToMotion"
				/>
			</div>
		</section>
	</div>
</template>

<style scoped>
.voter-dashboard {
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

.dashboard-section {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	margin-bottom: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.dashboard-section h3 {
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

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.9rem;
	font-weight: 500;
}

.btn-primary {
	background-color: #007bff;
	color: white;
}

.btn-primary:hover {
	background-color: #0056b3;
}

.btn-secondary {
	background-color: #6c757d;
	color: white;
}

.btn-secondary:hover:not(:disabled) {
	background-color: #545b62;
}

.btn-secondary:disabled {
	background-color: #ccc;
	cursor: not-allowed;
}

.meeting-section {
	background: #e3f2fd;
	border-radius: 8px;
	padding: 1rem;
	margin-bottom: 1.5rem;
	border-left: 4px solid #1565c0;
}

.meeting-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	flex-wrap: wrap;
	gap: 1rem;
}

.meeting-info {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.meeting-label {
	color: #666;
	font-size: 0.9rem;
}

.meeting-name {
	color: #1565c0;
	font-weight: 600;
	font-size: 1.1rem;
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

.motions-grid {
	display: grid;
	gap: 1rem;
	grid-template-columns: 1fr;
}

@media (min-width: 600px) {
	.motions-grid {
		grid-template-columns: repeat(2, 1fr);
	}
}
</style>
