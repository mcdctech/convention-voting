<script setup lang="ts">
/**
 * Navigation dropdown component
 * Displays a dropdown menu for grouped navigation items
 */
import { ref, onMounted, onUnmounted } from "vue";

defineProps<{
	label: string;
}>();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

function toggleDropdown(): void {
	isOpen.value = !isOpen.value;
}

function closeDropdown(): void {
	isOpen.value = false;
}

/**
 * Handle clicks outside the dropdown to close it
 */
function handleClickOutside(event: MouseEvent): void {
	const target = event.target;
	if (
		dropdownRef.value !== null &&
		target instanceof Node &&
		!dropdownRef.value.contains(target)
	) {
		closeDropdown();
	}
}

/**
 * Handle keyboard events for accessibility
 */
function handleKeydown(event: KeyboardEvent): void {
	if (event.key === "Escape" && isOpen.value) {
		closeDropdown();
	}
}

onMounted(() => {
	document.addEventListener("click", handleClickOutside);
	document.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
	document.removeEventListener("click", handleClickOutside);
	document.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
	<div ref="dropdownRef" class="nav-dropdown">
		<button
			class="dropdown-trigger"
			:class="{ 'is-open': isOpen }"
			:aria-expanded="isOpen"
			aria-haspopup="true"
			@click="toggleDropdown"
		>
			{{ label }}
			<span class="dropdown-arrow">▼</span>
		</button>
		<Transition name="dropdown">
			<div v-if="isOpen" class="dropdown-menu" @click="closeDropdown">
				<slot></slot>
			</div>
		</Transition>
	</div>
</template>

<style scoped>
.nav-dropdown {
	position: relative;
}

.dropdown-trigger {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 1rem;
	background: transparent;
	border: none;
	color: white;
	font-size: 1rem;
	cursor: pointer;
	border-radius: 4px;
	transition: background-color 0.2s;
}

.dropdown-trigger:hover {
	background-color: rgba(255, 255, 255, 0.1);
}

.dropdown-trigger.is-open {
	background-color: rgba(255, 255, 255, 0.2);
}

.dropdown-arrow {
	font-size: 0.625rem;
	transition: transform 0.2s;
}

.dropdown-trigger.is-open .dropdown-arrow {
	transform: rotate(180deg);
}

.dropdown-menu {
	position: absolute;
	top: 100%;
	left: 0;
	min-width: 200px;
	background-color: white;
	border-radius: 4px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	z-index: 100;
	overflow: hidden;
	margin-top: 0.25rem;
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
	transition:
		opacity 0.15s ease-in-out,
		transform 0.15s ease-in-out;
}

.dropdown-enter-from,
.dropdown-leave-to {
	opacity: 0;
	transform: translateY(-8px);
}
</style>
