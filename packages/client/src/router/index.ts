/**
 * Vue Router configuration
 */
import { createRouter, createWebHistory } from "vue-router";
import AdminLayout from "../views/AdminLayout.vue";
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
import MotionEdit from "../views/admin/MotionEdit.vue";

export const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: "/",
			redirect: "/admin/users",
		},
		{
			path: "/admin",
			component: AdminLayout,
			children: [
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
					path: "motions/:id/edit",
					name: "MotionEdit",
					component: MotionEdit,
					props: true,
				},
			],
		},
	],
});
