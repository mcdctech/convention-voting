<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getMyPools } from "../../services/api";
import type { Pool } from "@mcdc-convention-voting/shared";

const pools = ref<Pool[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadPools(): Promise<void> {
	try {
		const response = await getMyPools();
		if (response.success && response.data !== undefined) {
			pools.value = response.data;
		} else {
			error.value = response.error ?? "Failed to load pools";
		}
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load pools";
	} finally {
		loading.value = false;
	}
}

function retryLoad(): void {
	loading.value = true;
	error.value = null;
	void loadPools();
}

onMounted((): void => {
	void loadPools();
});
</script>

<template>
	<div class="my-pools">
		<div class="welcome-section">
			<h2>My Pools</h2>
			<p>
				View the voting pools you belong to. Pool membership determines which
				motions you can vote on.
			</p>
		</div>

		<section class="pools-section">
			<h3>Your Voting Pools</h3>

			<div v-if="loading" class="loading-state">
				<p>Loading your pools...</p>
			</div>

			<div v-else-if="error !== null" class="error-state">
				<p>{{ error }}</p>
				<button class="btn btn-primary" @click="retryLoad">Retry</button>
			</div>

			<div v-else-if="pools.length === 0" class="empty-state">
				<p>You are not a member of any voting pools.</p>
				<p class="hint">
					Contact an administrator if you believe this is an error.
				</p>
			</div>

			<div v-else class="pools-list">
				<div v-for="pool in pools" :key="pool.id" class="pool-card">
					<div class="pool-header">
						<h4 class="pool-name">{{ pool.poolName }}</h4>
						<span class="pool-key">{{ pool.poolKey }}</span>
					</div>
					<p v-if="pool.description" class="pool-description">
						{{ pool.description }}
					</p>
					<p v-else class="pool-description no-description">
						No description provided
					</p>
				</div>
			</div>
		</section>
	</div>
</template>

<style scoped>
.my-pools {
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

.pools-section {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	margin-bottom: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.pools-section h3 {
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

.pools-list {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.pool-card {
	background: #f8f9fa;
	border: 1px solid #e9ecef;
	border-radius: 6px;
	padding: 1rem;
}

.pool-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 0.5rem;
}

.pool-name {
	margin: 0;
	color: #2c3e50;
	font-size: 1.1rem;
}

.pool-key {
	font-size: 0.75rem;
	color: #6c757d;
	background: #e9ecef;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-family: monospace;
}

.pool-description {
	margin: 0;
	color: #666;
	font-size: 0.9rem;
}

.pool-description.no-description {
	font-style: italic;
	color: #999;
}
</style>
