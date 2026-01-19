/**
 * Vue Router configuration
 */
import { createRouter, createWebHistory } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { initKioskMode, useKioskMode } from "../composables/useKioskMode";
import AdminLayout from "../views/AdminLayout.vue";
import LoginPage from "../views/LoginPage.vue";
import VoterLayout from "../views/VoterLayout.vue";
import UserList from "../views/admin/UserList.vue";
import UserUpload from "../views/admin/UserUpload.vue";
import UserCreate from "../views/admin/UserCreate.vue";
import UserEdit from "../views/admin/UserEdit.vue";
import PasswordGeneration from "../views/admin/PasswordGeneration.vue";
import PoolList from "../views/admin/PoolList.vue";
import PoolUpload from "../views/admin/PoolUpload.vue";
import PoolCreate from "../views/admin/PoolCreate.vue";
import PoolEdit from "../views/admin/PoolEdit.vue";
import PoolUsers from "../views/admin/PoolUsers.vue";
import MeetingList from "../views/admin/MeetingList.vue";
import MeetingCreate from "../views/admin/MeetingCreate.vue";
import MeetingEdit from "../views/admin/MeetingEdit.vue";
import MeetingQuorum from "../views/admin/MeetingQuorum.vue";
import MotionList from "../views/admin/MotionList.vue";
import MotionCreate from "../views/admin/MotionCreate.vue";
import AdminMotionDetail from "../views/admin/MotionDetail.vue";
import VoterDashboard from "../views/voter/VoterDashboard.vue";
import VoterMotionDetail from "../views/voter/MotionDetail.vue";
import MyPools from "../views/voter/MyPools.vue";
import WatcherLayout from "../views/WatcherLayout.vue";
import WatcherDashboard from "../views/watcher/WatcherDashboard.vue";
import WatcherMeetingList from "../views/watcher/WatcherMeetingList.vue";
import WatcherMeetingReport from "../views/watcher/WatcherMeetingReport.vue";
import WatcherMotionReport from "../views/watcher/WatcherMotionReport.vue";
import WatcherQuorumReport from "../views/watcher/WatcherQuorumReport.vue";

declare module "vue-router" {
	interface RouteMeta {
		requiresAuth?: boolean;
		requiresAdmin?: boolean;
		requiresWatcher?: boolean;
		guestOnly?: boolean;
	}
}

export const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: "/login",
			name: "Login",
			component: LoginPage,
			meta: { guestOnly: true },
		},
		{
			path: "/",
			component: VoterLayout,
			meta: { requiresAuth: true },
			children: [
				{
					path: "",
					name: "VoterDashboard",
					component: VoterDashboard,
				},
				{
					path: "motion/:id",
					name: "VoterMotionDetail",
					component: VoterMotionDetail,
					props: true,
				},
				{
					path: "pools",
					name: "MyPools",
					component: MyPools,
				},
			],
		},
		{
			path: "/admin",
			component: AdminLayout,
			meta: { requiresAuth: true, requiresAdmin: true },
			children: [
				{
					path: "",
					redirect: "/admin/users",
				},
				{
					path: "users",
					name: "UserList",
					component: UserList,
				},
				{
					path: "users/upload",
					name: "UserUpload",
					component: UserUpload,
				},
				{
					path: "users/create",
					name: "UserCreate",
					component: UserCreate,
				},
				{
					path: "users/:id/edit",
					name: "UserEdit",
					component: UserEdit,
					props: true,
				},
				{
					path: "passwords",
					name: "PasswordGeneration",
					component: PasswordGeneration,
				},
				{
					path: "pools",
					name: "PoolList",
					component: PoolList,
				},
				{
					path: "pools/upload",
					name: "PoolUpload",
					component: PoolUpload,
				},
				{
					path: "pools/create",
					name: "PoolCreate",
					component: PoolCreate,
				},
				{
					path: "pools/:id/edit",
					name: "PoolEdit",
					component: PoolEdit,
					props: true,
				},
				{
					path: "pools/:id/users",
					name: "PoolUsers",
					component: PoolUsers,
					props: true,
				},
				{
					path: "meetings",
					name: "MeetingList",
					component: MeetingList,
				},
				{
					path: "meetings/create",
					name: "MeetingCreate",
					component: MeetingCreate,
				},
				{
					path: "meetings/:id/edit",
					name: "MeetingEdit",
					component: MeetingEdit,
					props: true,
				},
				{
					path: "meetings/:id/quorum",
					name: "MeetingQuorum",
					component: MeetingQuorum,
					props: true,
				},
				{
					path: "meetings/:meetingId/motions",
					name: "MotionList",
					component: MotionList,
					props: true,
				},
				{
					path: "meetings/:meetingId/motions/create",
					name: "MotionCreate",
					component: MotionCreate,
					props: true,
				},
				{
					path: "motions/:id",
					name: "AdminMotionDetail",
					component: AdminMotionDetail,
					props: true,
				},
			],
		},
		{
			path: "/watcher",
			component: WatcherLayout,
			meta: { requiresAuth: true, requiresWatcher: true },
			children: [
				{
					path: "",
					name: "WatcherDashboard",
					component: WatcherDashboard,
				},
				{
					path: "meetings",
					name: "WatcherMeetingList",
					component: WatcherMeetingList,
				},
				{
					path: "meetings/:id",
					name: "WatcherMeetingReport",
					component: WatcherMeetingReport,
					props: true,
				},
				{
					path: "meetings/:id/quorum",
					name: "WatcherQuorumReport",
					component: WatcherQuorumReport,
					props: true,
				},
				{
					path: "motions/:id",
					name: "WatcherMotionReport",
					component: WatcherMotionReport,
					props: true,
				},
			],
		},
	],
});

// Track if kiosk mode has been initialized
let kioskModeInitialized = false;

/**
 * Check if admin user should be redirected away from a voter-only route
 */
function shouldRedirectAdminFromVoterRoute(
	path: string,
	authenticated: boolean,
	admin: boolean,
): boolean {
	if (!authenticated || !admin) {
		return false;
	}
	// Admin routes are /admin, watcher routes are /watcher, login is /login
	// Admins should be redirected away from voter routes (/ and its children)
	return (
		!path.startsWith("/admin") &&
		!path.startsWith("/watcher") &&
		path !== "/login"
	);
}

/**
 * Check if watcher user should be redirected away from a non-watcher route
 */
function shouldRedirectWatcherFromOtherRoute(
	path: string,
	authenticated: boolean,
	watcher: boolean,
): boolean {
	if (!authenticated || !watcher) {
		return false;
	}
	// Watchers should only access /watcher routes and /login
	return !path.startsWith("/watcher") && path !== "/login";
}

/**
 * Initialize kiosk mode from URL on first navigation
 */
function initializeKioskModeOnce(): void {
	if (kioskModeInitialized) {
		return;
	}
	const searchString: string = window.location.search;
	const searchParams = new URLSearchParams(searchString);
	initKioskMode(searchParams);
	kioskModeInitialized = true;
}

/**
 * Get the appropriate home path for a user based on their role
 */
function getHomePath(admin: boolean, watcher: boolean): string {
	if (admin) {
		return "/admin";
	}
	if (watcher) {
		return "/watcher";
	}
	return "/";
}

interface AuthState {
	authenticated: boolean;
	admin: boolean;
	watcher: boolean;
}

interface RouteQuery {
	kiosk?: string;
}

interface RouteMeta {
	guestOnly?: boolean;
	requiresAuth?: boolean;
	requiresAdmin?: boolean;
	requiresWatcher?: boolean;
}

/**
 * Check route meta requirements and return redirect path if needed
 */
function checkMetaRequirements(
	toMeta: RouteMeta,
	authState: AuthState,
): string | null {
	const { authenticated, admin, watcher } = authState;

	// Guest-only routes (like login) - redirect authenticated users
	if (toMeta.guestOnly === true && authenticated) {
		return getHomePath(admin, watcher);
	}

	// Protected routes - redirect unauthenticated users to login
	if (toMeta.requiresAuth === true && !authenticated) {
		return "/login";
	}

	// Admin-only routes - redirect non-admins
	if (toMeta.requiresAdmin === true && !admin) {
		return getHomePath(admin, watcher);
	}

	// Watcher-only routes - redirect non-watchers
	if (toMeta.requiresWatcher === true && !watcher) {
		return getHomePath(admin, watcher);
	}

	return null;
}

/**
 * Check path-based redirect rules and return redirect path if needed
 */
function checkPathBasedRedirects(
	toPath: string,
	authState: AuthState,
): string | null {
	const { authenticated, admin, watcher } = authState;

	// Redirect watcher users away from non-watcher routes
	if (shouldRedirectWatcherFromOtherRoute(toPath, authenticated, watcher)) {
		return "/watcher";
	}

	// Redirect admin users away from voter-only routes to admin panel
	if (shouldRedirectAdminFromVoterRoute(toPath, authenticated, admin)) {
		return "/admin";
	}

	return null;
}

/**
 * Navigation guard for authentication and authorization
 */
router.beforeEach(async (to) => {
	const { isAuthenticated, isAdmin, isWatcher, isInitialized, checkAuth } =
		useAuth();
	const { getKioskModeQueryParam } = useKioskMode();

	initializeKioskModeOnce();

	// Wait for auth initialization if not done yet
	if (!isInitialized.value) {
		await checkAuth();
	}

	// Get kiosk query param to preserve in redirects
	const kioskQuery: RouteQuery = getKioskModeQueryParam();

	const authState: AuthState = {
		authenticated: isAuthenticated.value,
		admin: isAdmin.value,
		watcher: isWatcher.value,
	};

	// Check route meta requirements first
	const metaRedirect = checkMetaRequirements(to.meta, authState);
	if (metaRedirect !== null) {
		return { path: metaRedirect, query: kioskQuery };
	}

	// Check path-based redirects
	const pathRedirect = checkPathBasedRedirects(to.path, authState);
	if (pathRedirect !== null) {
		return { path: pathRedirect, query: kioskQuery };
	}

	// Allow navigation
	return true;
});
