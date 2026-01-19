<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useAuth } from "../composables/useAuth";

const { currentUser, logout } = useAuth();
</script>

<template>
	<div class="watcher-layout">
		<header class="watcher-header">
			<div class="header-top">
				<RouterLink to="/watcher" class="logo-link">
					<h1>MCDC Convention Voting - Observer</h1>
				</RouterLink>
				<div class="user-info">
					<span v-if="currentUser">{{ currentUser.username }}</span>
					<button class="logout-btn" @click="logout">Logout</button>
				</div>
			</div>
			<nav class="watcher-nav">
				<router-link to="/watcher/meetings" class="nav-link">
					Meetings
				</router-link>
			</nav>
		</header>

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
</style>
