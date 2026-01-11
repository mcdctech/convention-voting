/**
 * Vue application entry point
 */
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";

// Constants
const APP_MOUNT_SELECTOR = "#app";

const app = createApp(App);

app.use(router);

app.mount(APP_MOUNT_SELECTOR);
