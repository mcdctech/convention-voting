<template>
	<div class="admin-layout">
		<header class="admin-header">
			<h1>MCDC Convention Voting - Admin</h1>
			<nav class="admin-nav">
				<router-link to="/admin/users" class="nav-link"> Users </router-link>
				<router-link to="/admin/users/upload" class="nav-link">
					Upload CSV
				</router-link>
				<router-link to="/admin/users/create" class="nav-link">
					Create User
				</router-link>
				<router-link to="/admin/passwords" class="nav-link">
					Generate Passwords
				</router-link>
				<router-link to="/admin/pools" class="nav-link"> Pools </router-link>
				<router-link to="/admin/pools/upload" class="nav-link">
					Upload Pools CSV
				</router-link>
				<router-link to="/admin/pools/create" class="nav-link">
					Create Pool
				</router-link>
				<router-link to="/admin/meetings" class="nav-link">
					Meetings
				</router-link>
			</nav>
		</header>

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

.admin-header h1 {
	margin: 0 0 1rem 0;
	font-size: 1.5rem;
}

.admin-nav {
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

.admin-content {
	flex: 1;
	padding: 2rem;
	background-color: #f5f5f5;
}
</style>
