<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useAdminMeeting } from "../composables/useAdminMeeting";
import { useMobileNav } from "../composables/useMobileNav";
import NavDropdown from "../components/NavDropdown.vue";
import NavHamburger from "../components/NavHamburger.vue";
import MobileNavOverlay from "../components/MobileNavOverlay.vue";

const { currentUser, isAdmin, isMeetingAdmin, logout } = useAuth();
const { isJoined, currentMeeting, loadCurrentMeeting, leaveMeeting } =
	useAdminMeeting();
const { isOpen: isMobileNavOpen, toggleNav, closeNav } = useMobileNav();

// Determine the admin role label for the header
const adminRoleLabel = computed(() => {
	if (isAdmin.value) {
		return "Admin";
	}
	if (isMeetingAdmin.value) {
		return "Meeting Admin";
	}
	return "Admin";
});

// Users and Pools menus are global-admin only; scoped meeting admins only see
// the Meetings dropdown for the meeting(s) they can administer.
const showAdminMenus = computed(() => isAdmin.value);

// Handle leaving the current meeting
async function handleLeaveMeeting(): Promise<void> {
	await leaveMeeting();
}

// Handle leaving from mobile nav (also close nav)
async function handleLeaveMeetingMobile(): Promise<void> {
	await leaveMeeting();
	closeNav();
}

// Load current meeting state on mount
onMounted(() => {
	void loadCurrentMeeting();
});
</script>

<template>
	<div class="admin-layout">
		<header class="admin-header">
			<div class="header-top">
				<RouterLink to="/admin" class="logo-link">
					<h1>MCDC Convention Voting - {{ adminRoleLabel }}</h1>
				</RouterLink>
				<div class="header-right desktop-only">
					<span v-if="currentUser" class="user-name">
						{{ currentUser.firstName }} {{ currentUser.lastName }}
					</span>
					<button class="logout-btn" @click="logout">Logout</button>
				</div>
				<NavHamburger
					class="mobile-hamburger"
					:is-open="isMobileNavOpen"
					@toggle="toggleNav"
				/>
			</div>
			<nav class="admin-nav desktop-only">
				<NavDropdown v-if="showAdminMenus" label="Users">
					<RouterLink to="/admin/users" class="dropdown-link">
						All Users
					</RouterLink>
					<RouterLink to="/admin/users/upload" class="dropdown-link">
						Upload CSV
					</RouterLink>
					<RouterLink to="/admin/users/create" class="dropdown-link">
						Create User
					</RouterLink>
					<RouterLink to="/admin/passwords" class="dropdown-link">
						Generate Passwords
					</RouterLink>
					<RouterLink to="/admin/users/cleanup" class="dropdown-link">
						User Cleanup
					</RouterLink>
				</NavDropdown>
				<NavDropdown v-if="showAdminMenus" label="Pools">
					<RouterLink to="/admin/pools" class="dropdown-link">
						All Pools
					</RouterLink>
					<RouterLink to="/admin/pools/upload" class="dropdown-link">
						Upload CSV
					</RouterLink>
					<RouterLink to="/admin/pools/create" class="dropdown-link">
						Create Pool
					</RouterLink>
					<RouterLink to="/admin/pools/missing" class="dropdown-link">
						Missing Pools
					</RouterLink>
				</NavDropdown>
				<NavDropdown label="Meetings">
					<RouterLink to="/admin/meetings" class="dropdown-link">
						{{ isJoined ? currentMeeting?.meeting.name : "All Meetings" }}
					</RouterLink>
					<RouterLink
						v-if="isAdmin"
						to="/admin/meetings/create"
						class="dropdown-link"
					>
						Create Meeting
					</RouterLink>
					<RouterLink
						v-if="!isJoined"
						to="/admin/meetings/select"
						class="dropdown-link"
					>
						Join Meeting
					</RouterLink>
					<a
						v-else
						class="dropdown-link leave-link"
						@click="handleLeaveMeeting"
					>
						Leave Meeting
					</a>
				</NavDropdown>
			</nav>
		</header>

		<!-- Mobile navigation overlay -->
		<MobileNavOverlay :is-open="isMobileNavOpen" @close="closeNav">
			<div class="mobile-nav-content">
				<div v-if="currentUser" class="mobile-user-name">
					{{ currentUser.firstName }} {{ currentUser.lastName }}
				</div>

				<!-- Users section -->
				<div v-if="showAdminMenus" class="mobile-nav-section">
					<div class="mobile-nav-section-title">Users</div>
					<RouterLink
						to="/admin/users"
						class="mobile-nav-link"
						@click="closeNav"
					>
						All Users
					</RouterLink>
					<RouterLink
						to="/admin/users/upload"
						class="mobile-nav-link"
						@click="closeNav"
					>
						Upload CSV
					</RouterLink>
					<RouterLink
						to="/admin/users/create"
						class="mobile-nav-link"
						@click="closeNav"
					>
						Create User
					</RouterLink>
					<RouterLink
						to="/admin/passwords"
						class="mobile-nav-link"
						@click="closeNav"
					>
						Generate Passwords
					</RouterLink>
					<RouterLink
						to="/admin/users/cleanup"
						class="mobile-nav-link"
						@click="closeNav"
					>
						User Cleanup
					</RouterLink>
				</div>

				<!-- Pools section -->
				<div v-if="showAdminMenus" class="mobile-nav-section">
					<div class="mobile-nav-section-title">Pools</div>
					<RouterLink
						to="/admin/pools"
						class="mobile-nav-link"
						@click="closeNav"
					>
						All Pools
					</RouterLink>
					<RouterLink
						to="/admin/pools/upload"
						class="mobile-nav-link"
						@click="closeNav"
					>
						Upload CSV
					</RouterLink>
					<RouterLink
						to="/admin/pools/create"
						class="mobile-nav-link"
						@click="closeNav"
					>
						Create Pool
					</RouterLink>
					<RouterLink
						to="/admin/pools/missing"
						class="mobile-nav-link"
						@click="closeNav"
					>
						Missing Pools
					</RouterLink>
				</div>

				<!-- Meetings section -->
				<div class="mobile-nav-section">
					<div class="mobile-nav-section-title">Meetings</div>
					<RouterLink
						to="/admin/meetings"
						class="mobile-nav-link"
						@click="closeNav"
					>
						{{ isJoined ? currentMeeting?.meeting.name : "All Meetings" }}
					</RouterLink>
					<RouterLink
						v-if="isAdmin"
						to="/admin/meetings/create"
						class="mobile-nav-link"
						@click="closeNav"
					>
						Create Meeting
					</RouterLink>
					<RouterLink
						v-if="!isJoined"
						to="/admin/meetings/select"
						class="mobile-nav-link"
						@click="closeNav"
					>
						Join Meeting
					</RouterLink>
					<a
						v-else
						class="mobile-nav-link leave-link"
						@click="handleLeaveMeetingMobile"
					>
						Leave Meeting
					</a>
				</div>

				<button class="mobile-logout-btn" @click="logout">Logout</button>
			</div>
		</MobileNavOverlay>

		<main class="admin-content">
			<router-view />
		</main>
	</div>
</template>

<style scoped>
.admin-layout {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
}

.admin-header {
	background-color: #2c3e50;
	color: white;
	padding: 1rem 2rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header-top {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1rem;
}

.admin-header h1 {
	margin: 0;
	font-size: 1.5rem;
}

.logo-link {
	text-decoration: none;
	color: inherit;
}

.header-right {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.user-name {
	font-size: 0.875rem;
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

.admin-nav {
	display: flex;
	align-items: center;
	gap: 0.5rem;
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

/* Dropdown link styles */
.dropdown-link {
	display: block;
	padding: 0.75rem 1rem;
	color: #333;
	text-decoration: none;
	transition: background-color 0.2s;
}

.dropdown-link:hover {
	background-color: #f5f5f5;
}

.dropdown-link.router-link-active {
	background-color: #e8f4fc;
	color: #007bff;
}

.dropdown-link.leave-link {
	cursor: pointer;
	color: #c62828;
}

.dropdown-link.leave-link:hover {
	background-color: #ffebee;
}

.admin-content {
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

.mobile-nav-section {
	margin-bottom: 1rem;
}

.mobile-nav-section-title {
	padding: 0.5rem 1rem;
	font-size: 0.75rem;
	font-weight: 600;
	color: rgba(255, 255, 255, 0.6);
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.mobile-nav-link {
	display: block;
	padding: 0.75rem 1rem;
	color: white;
	text-decoration: none;
	font-size: 1rem;
	border-radius: 4px;
	transition: background-color 0.2s;
}

.mobile-nav-link:hover {
	background-color: rgba(255, 255, 255, 0.1);
}

.mobile-nav-link.leave-link {
	cursor: pointer;
	color: #ff8a80;
}

.mobile-nav-link.leave-link:hover {
	background-color: rgba(255, 138, 128, 0.2);
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
	.desktop-only {
		display: none;
	}

	.mobile-hamburger {
		display: flex;
	}

	.header-top {
		margin-bottom: 0;
	}

	.admin-header {
		padding: 1rem;
	}

	.admin-content {
		padding: 1rem;
	}
}
</style>
