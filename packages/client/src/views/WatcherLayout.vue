<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useMobileNav } from "../composables/useMobileNav";
import NavHamburger from "../components/NavHamburger.vue";
import MobileNavOverlay from "../components/MobileNavOverlay.vue";

const { currentUser, logout } = useAuth();
const { isOpen: isMobileNavOpen, toggleNav, closeNav } = useMobileNav();
</script>

<template>
	<div class="watcher-layout">
		<header class="watcher-header">
			<div class="header-top">
				<RouterLink to="/watcher" class="logo-link">
					<h1>MCDC Convention Voting - Observer</h1>
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
			<nav class="watcher-nav desktop-nav">
				<router-link to="/watcher/meetings" class="nav-link">
					Meetings
				</router-link>
			</nav>
		</header>

		<!-- Mobile navigation overlay -->
		<MobileNavOverlay :is-open="isMobileNavOpen" @close="closeNav">
			<div class="mobile-nav-content">
				<div v-if="currentUser" class="mobile-user-name">
					{{ currentUser.username }}
				</div>
				<RouterLink
					to="/watcher/meetings"
					class="mobile-nav-link"
					@click="closeNav"
				>
					Meetings
				</RouterLink>
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
	margin-bottom: 1rem;
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
