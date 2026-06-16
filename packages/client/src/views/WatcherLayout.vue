<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { RouterLink, useRouter, useRoute } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useKioskMode } from "../composables/useKioskMode";
import { useMobileNav } from "../composables/useMobileNav";
import {
	getCurrentMeetingForWatcher,
	leaveMeetingAsWatcher,
} from "../services/api";
import NavHamburger from "../components/NavHamburger.vue";
import MobileNavOverlay from "../components/MobileNavOverlay.vue";
import type { CurrentMeetingInfo } from "@mcdc-convention-voting/shared";

const router = useRouter();
const route = useRoute();
const { currentUser, logout } = useAuth();
const { getKioskModeQueryParam } = useKioskMode();
const { isOpen: isMobileNavOpen, toggleNav, closeNav } = useMobileNav();

const meetingCheckComplete = ref(false);
const currentMeetingInfo = ref<CurrentMeetingInfo | null>(null);
const isLeavingMeeting = ref(false);

// Re-check meeting participation on route changes
// This ensures the meeting indicator updates after joining a meeting
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
 * Leave current meeting and return to meeting selection
 */
async function handleLeaveMeeting(): Promise<void> {
	isLeavingMeeting.value = true;
	try {
		await leaveMeetingAsWatcher();
		currentMeetingInfo.value = null;
		closeNav();
		const kioskQuery = getKioskModeQueryParam();
		await router.push({
			path: "/watcher/meeting-selection",
			query: kioskQuery,
		});
	} catch {
		// Still redirect on error - meeting may already be left
		const kioskQuery = getKioskModeQueryParam();
		await router.push({
			path: "/watcher/meeting-selection",
			query: kioskQuery,
		});
	} finally {
		isLeavingMeeting.value = false;
	}
}

/**
 * Check if watcher has an active meeting participation
 * Redirects to meeting selection if not
 */
async function checkMeetingParticipation(): Promise<void> {
	// Skip check if already on watcher meeting selection page
	if (route.path === "/watcher/meeting-selection") {
		meetingCheckComplete.value = true;
		return;
	}

	try {
		const response = await getCurrentMeetingForWatcher();
		if (response.success) {
			const currentMeeting = response.data;
			if (currentMeeting === null) {
				// Watcher has no active meeting, redirect to meeting selection
				// Must await to prevent race condition with child component redirects
				currentMeetingInfo.value = null;
				const kioskQuery = getKioskModeQueryParam();
				await router.push({
					path: "/watcher/meeting-selection",
					query: kioskQuery,
				});
				// Set meetingCheckComplete after navigation since layout stays mounted
				meetingCheckComplete.value = true;
				return;
			}
			// Store the current meeting info for display
			currentMeetingInfo.value = currentMeeting;
		}
		meetingCheckComplete.value = true;
	} catch {
		// On error, redirect to meeting selection
		currentMeetingInfo.value = null;
		const kioskQuery = getKioskModeQueryParam();
		await router.push({
			path: "/watcher/meeting-selection",
			query: kioskQuery,
		});
		// Set meetingCheckComplete after navigation since layout stays mounted
		meetingCheckComplete.value = true;
	}
}

onMounted(() => {
	void checkMeetingParticipation();
});
</script>

<template>
	<div v-if="meetingCheckComplete" class="watcher-layout">
		<header class="watcher-header">
			<div class="header-top">
				<RouterLink to="/watcher" class="logo-link">
					<h1>MCDC Convention Voting - Watcher</h1>
				</RouterLink>
				<div class="user-info desktop-nav">
					<span v-if="currentUser">{{ currentUser.username }}</span>
					<button class="logout-btn" @click="logout">Logout</button>
				</div>
				<NavHamburger
					class="mobile-hamburger"
					:is-open="isMobileNavOpen"
					@toggle="toggleNav"
				/>
			</div>
			<!-- Meeting indicator -->
			<div v-if="currentMeetingInfo !== null" class="meeting-indicator">
				<span class="meeting-label">Observing:</span>
				<span class="meeting-name">{{ currentMeetingInfo.meeting.name }}</span>
			</div>
			<nav v-if="currentMeetingInfo !== null" class="watcher-nav desktop-nav">
				<router-link to="/watcher/meetings" class="nav-link">
					Current Meeting
				</router-link>
				<button
					class="nav-link change-meeting-btn"
					:disabled="isLeavingMeeting"
					@click="handleLeaveMeeting"
				>
					{{ isLeavingMeeting ? "Leaving..." : "Change Meeting" }}
				</button>
			</nav>
		</header>

		<!-- Mobile navigation overlay -->
		<MobileNavOverlay :is-open="isMobileNavOpen" @close="closeNav">
			<div class="mobile-nav-content">
				<div v-if="currentUser" class="mobile-user-name">
					{{ currentUser.username }}
				</div>
				<div v-if="currentMeetingInfo !== null" class="mobile-meeting-info">
					<span class="mobile-meeting-label">Observing:</span>
					<span class="mobile-meeting-name">{{
						currentMeetingInfo.meeting.name
					}}</span>
				</div>
				<RouterLink
					v-if="currentMeetingInfo !== null"
					to="/watcher/meetings"
					class="mobile-nav-link"
					@click="closeNav"
				>
					Current Meeting
				</RouterLink>
				<button
					v-if="currentMeetingInfo !== null"
					class="mobile-nav-link change-meeting-mobile"
					:disabled="isLeavingMeeting"
					@click="handleLeaveMeeting"
				>
					{{ isLeavingMeeting ? "Leaving..." : "Change Meeting" }}
				</button>
				<button class="mobile-logout-btn" @click="logout">Logout</button>
			</div>
		</MobileNavOverlay>

		<main class="watcher-content">
			<router-view />
		</main>
	</div>
</template>

<style scoped>
.watcher-layout {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
}

.watcher-header {
	background-color: #34495e;
	color: white;
	padding: 1rem 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header-top {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 0.5rem;
}

.meeting-indicator {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 0.75rem;
	background-color: rgba(255, 255, 255, 0.15);
	border-radius: 4px;
	margin-bottom: 0.75rem;
	font-size: 0.9rem;
}

.meeting-label {
	color: rgba(255, 255, 255, 0.8);
	font-weight: 500;
}

.meeting-name {
	color: white;
	font-weight: 600;
}

.watcher-header h1 {
	margin: 0;
	font-size: 1.5rem;
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

.logout-btn {
	background-color: rgba(255, 255, 255, 0.2);
	color: white;
	border: none;
	padding: 0.5rem 1rem;
	border-radius: 4px;
	cursor: pointer;
	transition: background-color 0.2s;
}

.logout-btn:hover {
	background-color: rgba(255, 255, 255, 0.3);
}

.watcher-nav {
	display: flex;
	gap: 1rem;
}

.nav-link {
	color: white;
	text-decoration: none;
	padding: 0.5rem 1rem;
	border-radius: 4px;
	transition: background-color 0.2s;
}

.nav-link:hover {
	background-color: rgba(255, 255, 255, 0.1);
}

.nav-link.router-link-active {
	background-color: rgba(255, 255, 255, 0.2);
}

.change-meeting-btn {
	background: transparent;
	border: 1px solid rgba(255, 255, 255, 0.5);
	cursor: pointer;
	font-size: inherit;
	font-family: inherit;
}

.change-meeting-btn:hover:not(:disabled) {
	background-color: rgba(255, 255, 255, 0.2);
	border-color: rgba(255, 255, 255, 0.8);
}

.change-meeting-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.watcher-content {
	flex: 1;
	padding: 2rem;
	background-color: #f5f5f5;
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

.mobile-meeting-info {
	padding: 0.75rem 1rem;
	background-color: rgba(255, 255, 255, 0.1);
	border-radius: 4px;
	margin: 0 0.5rem 0.5rem 0.5rem;
}

.mobile-meeting-label {
	display: block;
	font-size: 0.75rem;
	color: rgba(255, 255, 255, 0.7);
	margin-bottom: 0.25rem;
}

.mobile-meeting-name {
	display: block;
	font-size: 0.9rem;
	color: white;
	font-weight: 600;
}

.change-meeting-mobile {
	background: transparent;
	border: none;
	text-align: left;
	cursor: pointer;
	font-family: inherit;
}

.change-meeting-mobile:disabled {
	opacity: 0.6;
	cursor: not-allowed;
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

	.header-top {
		margin-bottom: 0;
	}

	.watcher-header {
		padding: 1rem;
	}

	.watcher-content {
		padding: 1rem;
	}
}
</style>
