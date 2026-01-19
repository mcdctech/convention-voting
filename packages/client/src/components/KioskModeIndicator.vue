<script setup lang="ts">
/**
 * Kiosk mode indicator component
 * Displays a badge in the lower-right corner when kiosk mode is active
 */
</script>

<template>
	<div class="kiosk-indicator">Kiosk Mode</div>
</template>

<style scoped>
.kiosk-indicator {
	position: fixed;
	bottom: 1rem;
	right: 1rem;
	padding: 0.5rem 1rem;
	background-color: #6c757d;
	color: white;
	font-size: 0.75rem;
	font-weight: 600;
	border-radius: 4px;
	z-index: 100;
	opacity: 0.9;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}
</style>
