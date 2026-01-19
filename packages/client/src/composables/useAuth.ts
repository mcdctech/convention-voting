/**
 * Authentication composable for managing auth state
 */
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import {
	login as apiLogin,
	getCurrentUser,
	getAuthToken,
	setAuthToken,
	clearAuthToken,
} from "../services/api";
import type { AuthUser, LoginResponse } from "@mcdc-convention-voting/shared";
import type { ApiResponse } from "../services/api";

// Module-level state (singleton pattern)
const currentUser = ref<AuthUser | null>(null);
const isLoading = ref(false);
const isInitialized = ref(false);

/**
 * Authentication composable
 */
export function useAuth(): {
	currentUser: typeof currentUser;
	isAuthenticated: ReturnType<typeof computed<boolean>>;
	isAdmin: ReturnType<typeof computed<boolean>>;
	isWatcher: ReturnType<typeof computed<boolean>>;
	isLoading: typeof isLoading;
	isInitialized: typeof isInitialized;
	login: (username: string, password: string) => Promise<void>;
	logout: () => void;
	checkAuth: () => Promise<void>;
} {
	const router = useRouter();

	const isAuthenticated = computed(() => currentUser.value !== null);
	const isAdmin = computed(() => currentUser.value?.isAdmin ?? false);
	const isWatcher = computed(() => currentUser.value?.isWatcher ?? false);

	/**
	 * Login with username and password
	 */
	async function login(username: string, password: string): Promise<void> {
		isLoading.value = true;

		try {
			const response: ApiResponse<LoginResponse> = await apiLogin({
				username,
				password,
			});

			if (!response.success || response.data === undefined) {
				throw new Error(response.error ?? "Login failed");
			}

			const {
				data: { token, user },
			} = response;
			setAuthToken(token);
			currentUser.value = user;
		} finally {
			isLoading.value = false;
		}
	}

	/**
	 * Logout and redirect to login page
	 */
	function logout(): void {
		clearAuthToken();
		currentUser.value = null;
		void router.push("/login");
	}

	/**
	 * Check authentication status on app load
	 * Verifies stored token is still valid
	 */
	async function checkAuth(): Promise<void> {
		const token = getAuthToken();

		if (token === null) {
			isInitialized.value = true;
			return;
		}

		isLoading.value = true;

		try {
			const response: ApiResponse<AuthUser> = await getCurrentUser();

			if (response.success && response.data !== undefined) {
				const { data: user } = response;
				currentUser.value = user;
			} else {
				// Token is invalid, clear it
				clearAuthToken();
				currentUser.value = null;
			}
		} catch {
			// Token verification failed, clear it
			clearAuthToken();
			currentUser.value = null;
		} finally {
			isLoading.value = false;
			isInitialized.value = true;
		}
	}

	return {
		currentUser,
		isAuthenticated,
		isAdmin,
		isWatcher,
		isLoading,
		isInitialized,
		login,
		logout,
		checkAuth,
	};
}
