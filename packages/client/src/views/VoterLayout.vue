<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useKioskMode } from "../composables/useKioskMode";
import { useActivityTimeout } from "../composables/useActivityTimeout";
import KioskModeIndicator from "../components/KioskModeIndicator.vue";
import InactivityWarningModal from "../components/InactivityWarningModal.vue";

const router = useRouter();
const { currentUser, isAdmin, logout } = useAuth();
const { isKioskMode, getKioskModeQueryParam } = useKioskMode();
const {
	showWarning,
	warningSecondsLeft,
	confirmActivity,
	startTracking,
	stopTracking,
} = useActivityTimeout();

/**
 * Handle inactivity logout - called when countdown expires
 */
function handleInactivityLogout(): void {
	logout();
	// Redirect to login with kiosk param preserved
	const kioskQuery = getKioskModeQueryParam();
	void router.push({ path: "/login", query: kioskQuery });
}

/**
 * Start or stop activity tracking based on kiosk mode and admin status
 */
function updateActivityTracking(): void {
	// Only track activity for non-admin users in kiosk mode
	if (isKioskMode.value && !isAdmin.value) {
		startTracking(handleInactivityLogout);
	} else {
		stopTracking();
	}
}

// Watch for changes in kiosk mode or admin status
watch([isKioskMode, isAdmin], updateActivityTracking);

onMounted(() => {
	updateActivityTracking();
});

onUnmounted(() => {
	stopTracking();
});
</script>

<template>
	<div class="voter-layout">
		<header class="header">
			<div class="header-content">
				<RouterLink to="/" class="logo-link">
					<h1>MCDC Convention Voting</h1>
				</RouterLink>
				<div class="user-info">
					<span v-if="currentUser" class="user-name">
						{{ currentUser.firstName }} {{ currentUser.lastName }}
					</span>
					<RouterLink to="/" class="btn btn-nav">Dashboard</RouterLink>
					<RouterLink to="/pools" class="btn btn-nav">My Pools</RouterLink>
					<button class="btn btn-logout" @click="logout">Logout</button>
				</div>
			</div>
		</header>

		<main class="main-content">
			<router-view />
		</main>

		<!-- Kiosk mode indicator -->
		<KioskModeIndicator v-if="isKioskMode" />

		<!-- Inactivity warning modal -->
		<InactivityWarningModal
			v-if="showWarning"
			:seconds-left="warningSecondsLeft"
			@confirm="confirmActivity"
		/>
	</div>
</template>

<style scoped>
.voter-layout {
	min-height: 100vh;
	background-color: #f5f5f5;
}

.header {
	background-color: #2c3e50;
	color: white;
	padding: 1rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header-content {
	max-width: 1200px;
	margin: 0 auto;
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.header h1 {
	margin: 0;
	font-size: 1.25rem;
}

.logo-link {
	text-decoration: none;
	color: inherit;
}

.user-info {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.user-name {
	font-size: 0.875rem;
}

.btn-nav,
.btn-logout {
	padding: 0.5rem 1rem;
	background-color: transparent;
	border: 1px solid white;
	color: white;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.875rem;
	transition: all 0.2s;
	text-decoration: none;
}

.btn-nav:hover,
.btn-logout:hover {
	background-color: white;
	color: #2c3e50;
}

.main-content {
	max-width: 1200px;
	margin: 0 auto;
	padding: 2rem;
}
</style>
