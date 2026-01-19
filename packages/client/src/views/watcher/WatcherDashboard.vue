<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

onMounted(() => {
	void router.replace("/watcher/meetings");
});
</script>

<template>
	<div class="watcher-dashboard">
		<p>Redirecting to meetings...</p>
	</div>
</template>

<style scoped>
.watcher-dashboard {
	padding: 2rem;
	text-align: center;
	color: #666;
}
</style>
