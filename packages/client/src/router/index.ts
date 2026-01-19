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
import MotionList from "../views/admin/MotionList.vue";
import MotionCreate from "../views/admin/MotionCreate.vue";
import AdminMotionDetail from "../views/admin/MotionDetail.vue";
import VoterDashboard from "../views/voter/VoterDashboard.vue";
import VoterMotionDetail from "../views/voter/MotionDetail.vue";
import MyPools from "../views/voter/MyPools.vue";

declare module "vue-router" {
	interface RouteMeta {
		requiresAuth?: boolean;
		requiresAdmin?: boolean;
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
	],
});

// Track if kiosk mode has been initialized
let kioskModeInitialized = false;

/**
 * Navigation guard for authentication and authorization
 */
router.beforeEach(async (to) => {
	const { isAuthenticated, isAdmin, isInitialized, checkAuth } = useAuth();
	const { getKioskModeQueryParam } = useKioskMode();

	// Initialize kiosk mode from URL on first navigation
	if (!kioskModeInitialized) {
		const searchString: string = window.location.search;
		const searchParams = new URLSearchParams(searchString);
		initKioskMode(searchParams);
		kioskModeInitialized = true;
	}

	// Wait for auth initialization if not done yet
	if (!isInitialized.value) {
		await checkAuth();
	}

	// Get kiosk query param to preserve in redirects
	const kioskQuery = getKioskModeQueryParam();

	// Guest-only routes (like login) - redirect authenticated users
	if (to.meta.guestOnly === true && isAuthenticated.value) {
		// Redirect admins to admin panel, others to voter dashboard
		if (isAdmin.value) {
			return { path: "/admin", query: kioskQuery };
		}
		return { path: "/", query: kioskQuery };
	}

	// Protected routes - redirect unauthenticated users to login
	if (to.meta.requiresAuth === true && !isAuthenticated.value) {
		return { path: "/login", query: kioskQuery };
	}

	// Admin-only routes - redirect non-admins to voter dashboard
	if (to.meta.requiresAdmin === true && !isAdmin.value) {
		return { path: "/", query: kioskQuery };
	}

	// Allow navigation
	return true;
});
