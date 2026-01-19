/**
 * Mobile navigation composable for managing mobile nav state
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { ComputedRef, Ref } from "vue";

// Breakpoint for mobile navigation (in pixels)
export const MOBILE_BREAKPOINT_PX = 768;

// Module-level state (singleton pattern)
const isOpen = ref(false);
const isMobileViewport = ref(false);

/**
 * Check if the current viewport width is mobile-sized
 */
function checkViewportWidth(): void {
	isMobileViewport.value = window.innerWidth < MOBILE_BREAKPOINT_PX;
	// Close mobile nav when switching to desktop
	if (!isMobileViewport.value) {
		isOpen.value = false;
	}
}

// Initialize on module load if window exists
if (typeof window !== "undefined") {
	checkViewportWidth();
}

/**
 * Mobile navigation composable
 */
export function useMobileNav(): {
	isOpen: Ref<boolean>;
	isMobileViewport: ComputedRef<boolean>;
	openNav: () => void;
	closeNav: () => void;
	toggleNav: () => void;
} {
	const isMobile = computed(() => isMobileViewport.value);

	function openNav(): void {
		isOpen.value = true;
	}

	function closeNav(): void {
		isOpen.value = false;
	}

	function toggleNav(): void {
		isOpen.value = !isOpen.value;
	}

	// Set up resize listener
	onMounted(() => {
		checkViewportWidth();
		window.addEventListener("resize", checkViewportWidth);
	});

	onUnmounted(() => {
		window.removeEventListener("resize", checkViewportWidth);
	});

	return {
		isOpen,
		isMobileViewport: isMobile,
		openNav,
		closeNav,
		toggleNav,
	};
}
