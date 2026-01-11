<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useAuth } from "../composables/useAuth";

const { currentUser, isAdmin, logout } = useAuth();
</script>

<template>
	<div class="voter-layout">
		<header class="header">
			<div class="header-content">
				<h1>MCDC Convention Voting</h1>
				<div class="user-info">
					<span v-if="currentUser" class="user-name">
						{{ currentUser.firstName }} {{ currentUser.lastName }}
					</span>
					<RouterLink to="/" class="btn btn-nav">Dashboard</RouterLink>
					<RouterLink to="/pools" class="btn btn-nav">My Pools</RouterLink>
					<RouterLink v-if="isAdmin" to="/admin" class="btn btn-admin">
						Admin Panel
					</RouterLink>
					<button class="btn btn-logout" @click="logout">Logout</button>
				</div>
			</div>
		</header>

		<main class="main-content">
			<router-view />
		</main>
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

.user-info {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.user-name {
	font-size: 0.875rem;
}

.btn-nav,
.btn-admin,
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
.btn-admin:hover,
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
