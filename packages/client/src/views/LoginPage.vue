<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useKioskMode } from "../composables/useKioskMode";
import KioskModeIndicator from "../components/KioskModeIndicator.vue";

const router = useRouter();
const { login, logout, currentUser, isLoading } = useAuth();
const { isKioskMode } = useKioskMode();

const username = ref("");
const password = ref("");
const showPassword = ref(false);
const error = ref<string | null>(null);

// Delay in ms before clearing auto-filled fields (allows browser to auto-fill first)
const AUTO_FILL_CLEAR_DELAY_MS = 100;

// Delay in ms before resetting the form after a kiosk login rejection
const KIOSK_ERROR_RESET_DELAY_MS = 10000;

// Computed properties for autocomplete - disabled in kiosk mode to prevent auto-fill
const usernameAutocomplete = computed(() =>
	isKioskMode.value ? "off" : "username",
);
const passwordAutocomplete = computed(() =>
	isKioskMode.value ? "off" : "current-password",
);

// Disable "Show password" checkbox in kiosk mode until user types something
// This prevents the browser from auto-filling credentials when the checkbox is clicked
const showPasswordDisabled = computed(
	() => isKioskMode.value && password.value === "",
);

/**
 * Clear any auto-filled credentials in kiosk mode
 * Browsers often ignore autocomplete="off", so we clear fields after mount
 */
function clearAutoFilledFields(): void {
	if (isKioskMode.value) {
		username.value = "";
		password.value = "";
	}
}

/**
 * Reset the login form for kiosk mode
 * Clears username, password, error message, and show password state
 */
function resetFormForKiosk(): void {
	username.value = "";
	password.value = "";
	error.value = null;
	showPassword.value = false;
}

// In kiosk mode, clear any auto-filled fields after component mounts
// Use delay to allow browser auto-fill to complete first, then clear it
onMounted(() => {
	if (isKioskMode.value) {
		void nextTick(() => {
			setTimeout(clearAutoFilledFields, AUTO_FILL_CLEAR_DELAY_MS);
		});
	}
});

async function handleSubmit(): Promise<void> {
	error.value = null;

	if (username.value === "" || password.value === "") {
		error.value = "Please enter both username and password.";
		return;
	}

	try {
		await login(username.value, password.value);

		// In kiosk mode, restrict login to voters and global admins only
		// Block watchers and meeting admins (they should use regular login)
		if (isKioskMode.value) {
			const user = currentUser.value;
			if (
				user !== null &&
				!user.isAdmin &&
				(user.isWatcher || user.isMeetingAdmin)
			) {
				// Clear auth and show error
				logout();
				password.value = "";
				error.value =
					"Kiosk mode is for voters only. Please use a different login method.";
				// Auto-reset form after delay so kiosk is ready for next user
				setTimeout(resetFormForKiosk, KIOSK_ERROR_RESET_DELAY_MS);
				return;
			}
		}

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
						:autocomplete="usernameAutocomplete"
					/>
				</div>

				<div class="form-group">
					<label for="password">Password</label>
					<input
						id="password"
						v-model="password"
						:type="showPassword ? 'text' : 'password'"
						placeholder="Enter your password"
						:disabled="isLoading"
						:autocomplete="passwordAutocomplete"
					/>
				</div>

				<div class="form-group show-password-group">
					<label class="checkbox-label">
						<input
							v-model="showPassword"
							type="checkbox"
							:disabled="isLoading || showPasswordDisabled"
						/>
						Show password
					</label>
				</div>

				<button type="submit" class="btn btn-primary" :disabled="isLoading">
					<span v-if="isLoading">Signing in...</span>
					<span v-else>Sign In</span>
				</button>
			</form>

			<p class="case-sensitive-note">
				Note: Username and password are case-sensitive.
			</p>
		</div>

		<!-- Kiosk mode indicator -->
		<KioskModeIndicator v-if="isKioskMode" />
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

.show-password-group {
	margin-bottom: 1.5rem;
}

.checkbox-label {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-weight: normal;
	color: #555;
	cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
	width: auto;
	margin: 0;
	cursor: pointer;
}

.case-sensitive-note {
	margin-top: 1.5rem;
	padding-top: 1rem;
	border-top: 1px solid #eee;
	font-size: 0.8125rem;
	color: #666;
	text-align: center;
}
</style>
