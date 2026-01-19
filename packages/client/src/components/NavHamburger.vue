<script setup lang="ts">
/**
 * Hamburger menu button component
 * Displays a hamburger icon that transforms to X when open
 */

defineProps<{
	isOpen: boolean;
}>();

defineEmits<{
	toggle: [];
}>();
</script>

<template>
	<button
		class="hamburger-btn"
		:class="{ 'is-open': isOpen }"
		:aria-expanded="isOpen"
		aria-label="Toggle navigation menu"
		@click="$emit('toggle')"
	>
		<span class="hamburger-line"></span>
		<span class="hamburger-line"></span>
		<span class="hamburger-line"></span>
	</button>
</template>

<style scoped>
.hamburger-btn {
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	width: 24px;
	height: 18px;
	padding: 0;
	background: transparent;
	border: none;
	cursor: pointer;
}

.hamburger-line {
	display: block;
	width: 100%;
	height: 2px;
	background-color: white;
	border-radius: 1px;
	transition:
		transform 0.2s ease-in-out,
		opacity 0.2s ease-in-out;
}

/* Transform to X when open */
.is-open .hamburger-line:nth-child(1) {
	transform: translateY(8px) rotate(45deg);
}

.is-open .hamburger-line:nth-child(2) {
	opacity: 0;
}

.is-open .hamburger-line:nth-child(3) {
	transform: translateY(-8px) rotate(-45deg);
}
</style>
