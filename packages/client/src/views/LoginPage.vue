<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";

const router = useRouter();
const { login, isLoading } = useAuth();

const username = ref("");
const password = ref("");
const error = ref<string | null>(null);

async function handleSubmit(): Promise<void> {
	error.value = null;

	if (username.value === "" || password.value === "") {
		error.value = "Please enter both username and password.";
		return;
	}

	try {
		await login(username.value, password.value);
		void router.push("/");
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Login failed";
	}
}
</script>

<template>
	<div class="login-page">
		<div class="login-card">
			<h1>MCDC Convention Voting</h1>
			<h2>Sign In</h2>

			<form @submit.prevent="handleSubmit">
				<div v-if="error" class="error-message">
					{{ error }}
				</div>

				<div class="form-group">
					<label for="username">Username</label>
					<input
						id="username"
						v-model="username"
						type="text"
						placeholder="Enter your username"
						:disabled="isLoading"
						autocomplete="username"
					/>
				</div>

				<div class="form-group">
					<label for="password">Password</label>
					<input
						id="password"
						v-model="password"
						type="password"
						placeholder="Enter your password"
						:disabled="isLoading"
						autocomplete="current-password"
					/>
				</div>

				<button type="submit" class="btn btn-primary" :disabled="isLoading">
					<span v-if="isLoading">Signing in...</span>
					<span v-else>Sign In</span>
				</button>
			</form>
		</div>
	</div>
</template>

<style scoped>
.login-page {
	min-height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: #f5f5f5;
	padding: 1rem;
}

.login-card {
	background: white;
	padding: 2rem;
	border-radius: 8px;
	box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
	width: 100%;
	max-width: 400px;
}

.login-card h1 {
	text-align: center;
	color: #2c3e50;
	margin: 0 0 0.5rem 0;
	font-size: 1.5rem;
}

.login-card h2 {
	text-align: center;
	color: #666;
	margin: 0 0 2rem 0;
	font-size: 1.25rem;
	font-weight: normal;
}

.error-message {
	background-color: #fee;
	color: #c33;
	padding: 0.75rem 1rem;
	border-radius: 4px;
	margin-bottom: 1rem;
	font-size: 0.875rem;
}

.form-group {
	margin-bottom: 1.25rem;
}

.form-group label {
	display: block;
	margin-bottom: 0.5rem;
	font-weight: 500;
	color: #333;
}

.form-group input {
	width: 100%;
	padding: 0.75rem;
	border: 1px solid #ddd;
	border-radius: 4px;
	font-size: 1rem;
	transition: border-color 0.2s;
	box-sizing: border-box;
}

.form-group input:focus {
	outline: none;
	border-color: #007bff;
	box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.form-group input:disabled {
	background-color: #f5f5f5;
	cursor: not-allowed;
}

.btn {
	width: 100%;
	padding: 0.75rem;
	border: none;
	border-radius: 4px;
	font-size: 1rem;
	font-weight: 500;
	cursor: pointer;
	transition: background-color 0.2s;
}

.btn-primary {
	background-color: #007bff;
	color: white;
}

.btn-primary:hover:not(:disabled) {
	background-color: #0056b3;
}

.btn:disabled {
	opacity: 0.7;
	cursor: not-allowed;
}
</style>
