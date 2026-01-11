<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../../composables/useAuth";
import { getOpenMotions } from "../../services/api";
import MotionCard from "../../components/MotionCard.vue";
import type { OpenMotionForVoter } from "@mcdc-convention-voting/shared";

const { currentUser } = useAuth();
const router = useRouter();

// Polling interval: 30 seconds
const POLL_INTERVAL_MS = 30000;

const motions = ref<OpenMotionForVoter[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

async function loadOpenMotions(): Promise<void> {
	try {
		const response = await getOpenMotions();
		if (response.success && response.data !== undefined) {
			motions.value = response.data.data;
		} else {
			error.value = response.error ?? "Failed to load motions";
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load motions";
	} finally {
		loading.value = false;
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
