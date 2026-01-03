/**
 * Vue Router configuration
 */
import { createRouter, createWebHistory, type Router } from "vue-router";
import AdminLayout from "../views/AdminLayout.vue";
import UserList from "../views/admin/UserList.vue";
import UserUpload from "../views/admin/UserUpload.vue";
import UserCreate from "../views/admin/UserCreate.vue";
import UserEdit from "../views/admin/UserEdit.vue";
import PasswordGeneration from "../views/admin/PasswordGeneration.vue";

export const router: Router = createRouter({
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
			],
		},
	],
});
