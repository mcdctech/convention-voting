import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Constants
const DEFAULT_PORT = 5173;
const DEFAULT_API_URL = "http://localhost:3000";

export default defineConfig({
	plugins: [vue()],
	server: {
		port: DEFAULT_PORT,
		proxy: {
			"/api": {
				target: process.env.VITE_API_URL ?? DEFAULT_API_URL,
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: "dist",
		sourcemap: true,
	},
});
