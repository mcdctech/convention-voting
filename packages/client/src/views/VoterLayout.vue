<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { RouterLink, useRouter, useRoute } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useKioskMode } from "../composables/useKioskMode";
import { useActivityTimeout } from "../composables/useActivityTimeout";
import { useMobileNav } from "../composables/useMobileNav";
import { getCurrentMeeting } from "../services/api";
import KioskModeIndicator from "../components/KioskModeIndicator.vue";
import InactivityWarningModal from "../components/InactivityWarningModal.vue";
import NavHamburger from "../components/NavHamburger.vue";
import MobileNavOverlay from "../components/MobileNavOverlay.vue";

const router = useRouter();
const route = useRoute();
const { currentUser, logout } = useAuth();
const { isKioskMode, getKioskModeQueryParam } = useKioskMode();
const { isOpen: isMobileNavOpen, toggleNav, closeNav } = useMobileNav();
const {
	showWarning,
	warningSecondsLeft,
	confirmActivity,
	startTracking,
	stopTracking,
} = useActivityTimeout();

const meetingCheckComplete = ref(false);

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
 * Start or stop activity tracking based on kiosk mode
 * All users (including admins) are subject to inactivity timeout in kiosk mode
 */
function updateActivityTracking(): void {
	if (isKioskMode.value) {
		startTracking(handleInactivityLogout);
	} else {
		stopTracking();
	}
}

// Watch for changes in kiosk mode
watch(isKioskMode, updateActivityTracking);

// Re-check meeting participation on every navigation so a user who is kicked
// mid-session is redirected to meeting selection on the next route change.
watch(
	() => route.path,
	(newPath, oldPath) => {
		if (newPath === oldPath) {
			return;
		}
		void checkMeetingParticipation();
	},
);

/**
 * Check if user has an active meeting participation
 * Redirects to meeting selection if not
 */
async function checkMeetingParticipation(): Promise<void> {
	// Skip check for pages that don't require active meeting participation
	// - /meetings: meeting selection page
	// - /pools: view user's pool memberships (informational, no meeting required)
	if (route.path === "/meetings" || route.path === "/pools") {
		meetingCheckComplete.value = true;
		return;
	}

	try {
		const response = await getCurrentMeeting();
		if (response.success) {
			const currentMeeting = response.data;
			if (currentMeeting === null) {
				// User has no active meeting, redirect to meeting selection
				// Must await to prevent race condition with child component redirects
				const kioskQuery = getKioskModeQueryParam();
				await router.push({ path: "/meetings", query: kioskQuery });
				// Set meetingCheckComplete after navigation since layout stays mounted
				meetingCheckComplete.value = true;
				return;
			}
		}
		meetingCheckComplete.value = true;
	} catch {
		// On error, redirect to meeting selection
		const kioskQuery = getKioskModeQueryParam();
		await router.push({ path: "/meetings", query: kioskQuery });
		// Set meetingCheckComplete after navigation since layout stays mounted
		meetingCheckComplete.value = true;
	}
}

onMounted(() => {
	updateActivityTracking();
	void checkMeetingParticipation();
});

onUnmounted(() => {
	stopTracking();
});
</script>

<template>
	<div v-if="meetingCheckComplete" class="voter-layout">
		<header class="header">
			<div class="header-content">
				<RouterLink to="/" class="logo-link">
					<h1>MCDC Convention Voting</h1>
				</RouterLink>
				<!-- Desktop navigation -->
				<div class="user-info desktop-nav">
					<span v-if="currentUser" class="user-name">
						{{ currentUser.firstName }} {{ currentUser.lastName }}
					</span>
					<RouterLink to="/" class="btn btn-nav">Dashboard</RouterLink>
					<RouterLink to="/pools" class="btn btn-nav">My Pools</RouterLink>
					<button class="btn btn-logout" @click="logout">Logout</button>
				</div>
				<!-- Mobile hamburger button -->
				<NavHamburger
					class="mobile-hamburger"
					:is-open="isMobileNavOpen"
					@toggle="toggleNav"
				/>
			</div>
		</header>

		<!-- Mobile navigation overlay -->
		<MobileNavOverlay :is-open="isMobileNavOpen" @close="closeNav">
			<div class="mobile-nav-content">
				<div v-if="currentUser" class="mobile-user-name">
					{{ currentUser.firstName }} {{ currentUser.lastName }}
				</div>
				<RouterLink to="/" class="mobile-nav-link" @click="closeNav">
					Dashboard
				</RouterLink>
				<RouterLink to="/pools" class="mobile-nav-link" @click="closeNav">
					My Pools
				</RouterLink>
				<button class="mobile-logout-btn" @click="logout">Logout</button>
			</div>
		</MobileNavOverlay>

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

/* Mobile hamburger - hidden on desktop */
.mobile-hamburger {
	display: none;
}

/* Mobile navigation content styles */
.mobile-nav-content {
	display: flex;
	flex-direction: column;
	padding: 1rem;
}

.mobile-user-name {
	padding: 1rem;
	font-size: 1rem;
	font-weight: 600;
	color: white;
	border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	margin-bottom: 0.5rem;
}

.mobile-nav-link {
	display: block;
	padding: 1rem;
	color: white;
	text-decoration: none;
	font-size: 1rem;
	border-radius: 4px;
	transition: background-color 0.2s;
}

.mobile-nav-link:hover {
	background-color: rgba(255, 255, 255, 0.1);
}

.mobile-logout-btn {
	margin-top: 1rem;
	padding: 1rem;
	background-color: rgba(255, 255, 255, 0.1);
	border: 1px solid rgba(255, 255, 255, 0.3);
	color: white;
	border-radius: 4px;
	cursor: pointer;
	font-size: 1rem;
	text-align: left;
	transition: background-color 0.2s;
}

.mobile-logout-btn:hover {
	background-color: rgba(255, 255, 255, 0.2);
}

/* Responsive breakpoint */
@media (max-width: 767px) {
	.desktop-nav {
		display: none;
	}

	.mobile-hamburger {
		display: flex;
	}

	.main-content {
		padding: 1rem;
	}
}
</style>
