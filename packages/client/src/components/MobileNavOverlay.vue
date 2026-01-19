<script setup lang="ts">
/**
 * Mobile navigation overlay component
 * Provides a full-screen overlay for mobile navigation
 */
import { onMounted, onUnmounted, watch } from "vue";

const props = defineProps<{
	isOpen: boolean;
}>();

const emit = defineEmits<{
	close: [];
}>();

/**
 * Handle keyboard events for accessibility
 */
function handleKeydown(event: KeyboardEvent): void {
	if (event.key === "Escape" && props.isOpen) {
		emit("close");
	}
}

/**
 * Prevent body scroll when overlay is open
 */
function updateBodyScroll(isOpen: boolean): void {
	if (isOpen) {
		document.body.style.overflow = "hidden";
	} else {
		document.body.style.overflow = "";
	}
}

watch(
	() => props.isOpen,
	(isOpen) => {
		updateBodyScroll(isOpen);
	},
);

onMounted(() => {
	document.addEventListener("keydown", handleKeydown);
	if (props.isOpen) {
		updateBodyScroll(true);
	}
});

onUnmounted(() => {
	document.removeEventListener("keydown", handleKeydown);
	document.body.style.overflow = "";
});
</script>

<template>
	<Teleport to="body">
		<Transition name="overlay">
			<div
				v-if="isOpen"
				class="mobile-nav-overlay"
				role="dialog"
				aria-modal="true"
				aria-label="Navigation menu"
			>
				<div class="overlay-backdrop" @click="$emit('close')"></div>
				<nav class="overlay-content">
					<slot></slot>
				</nav>
			</div>
		</Transition>
	</Teleport>
</template>

<style scoped>
.mobile-nav-overlay {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	justify-content: flex-end;
}

.overlay-backdrop {
	position: absolute;
	inset: 0;
	background-color: rgba(0, 0, 0, 0.5);
}

.overlay-content {
	position: relative;
	width: 280px;
	max-width: 80vw;
	height: 100%;
	background-color: #2c3e50;
	box-shadow: -4px 0 16px rgba(0, 0, 0, 0.2);
	overflow-y: auto;
	padding: 1rem 0;
}

/* Transition animations */
.overlay-enter-active,
.overlay-leave-active {
	transition: opacity 0.2s ease-in-out;
}

.overlay-enter-active .overlay-content,
.overlay-leave-active .overlay-content {
	transition: transform 0.2s ease-in-out;
}

.overlay-enter-from,
.overlay-leave-to {
	opacity: 0;
}

.overlay-enter-from .overlay-content,
.overlay-leave-to .overlay-content {
	transform: translateX(100%);
}
</style>
