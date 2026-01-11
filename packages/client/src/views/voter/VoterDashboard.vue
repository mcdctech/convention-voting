<script setup lang="ts">
import { useAuth } from "../../composables/useAuth";

const { currentUser } = useAuth();
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
			<h3>Active Meetings</h3>
			<div class="empty-state">
				<p>No active meetings at this time.</p>
				<p class="hint">Check back later for upcoming voting sessions.</p>
			</div>
		</section>

		<section class="dashboard-section">
			<h3>Active Motions</h3>
			<div class="empty-state">
				<p>No active motions requiring your vote.</p>
				<p class="hint">
					When a motion is open for voting, it will appear here.
				</p>
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
</style>
