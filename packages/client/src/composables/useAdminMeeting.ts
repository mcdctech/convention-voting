/**
 * Admin meeting composable for managing joined meeting state
 */
import { ref, computed } from "vue";
import {
	getCurrentMeetingForAdmin,
	joinMeetingAsAdmin,
	leaveMeetingAsAdmin,
} from "../services/api";
import type { CurrentMeetingInfo } from "@mcdc-convention-voting/shared";

// Module-level state (singleton pattern)
const currentMeeting = ref<CurrentMeetingInfo | null>(null);
const isLoading = ref(false);
const isInitialized = ref(false);

/**
 * Admin meeting composable for tracking current joined meeting
 */
export function useAdminMeeting(): {
	currentMeeting: typeof currentMeeting;
	isJoined: ReturnType<typeof computed<boolean>>;
	joinedMeetingId: ReturnType<typeof computed<number | null>>;
	joinedMeetingAdminPoolId: ReturnType<typeof computed<number | null>>;
	isLoading: typeof isLoading;
	isInitialized: typeof isInitialized;
	loadCurrentMeeting: () => Promise<void>;
	joinMeeting: (meetingId: number) => Promise<void>;
	leaveMeeting: () => Promise<void>;
} {
	const isJoined = computed(() => currentMeeting.value !== null);
	const joinedMeetingId = computed(
		() => currentMeeting.value?.meeting.id ?? null,
	);
	const joinedMeetingAdminPoolId = computed(
		() => currentMeeting.value?.meeting.meetingAdminPoolId ?? null,
	);

	/**
	 * Load current meeting state from server
	 */
	async function loadCurrentMeeting(): Promise<void> {
		isLoading.value = true;

		try {
			const response = await getCurrentMeetingForAdmin();

			if (response.success) {
				currentMeeting.value = response.data ?? null;
			} else {
				currentMeeting.value = null;
			}
		} catch {
			currentMeeting.value = null;
		} finally {
			isLoading.value = false;
			isInitialized.value = true;
		}
	}

	/**
	 * Join a meeting as admin
	 */
	async function joinMeeting(meetingId: number): Promise<void> {
		isLoading.value = true;

		try {
			const response = await joinMeetingAsAdmin(meetingId);

			if (!response.success) {
				throw new Error(response.error ?? "Failed to join meeting");
			}

			// Reload current meeting to get full info
			await loadCurrentMeeting();
		} finally {
			isLoading.value = false;
		}
	}

	/**
	 * Leave the current meeting
	 */
	async function leaveMeeting(): Promise<void> {
		isLoading.value = true;

		try {
			const response = await leaveMeetingAsAdmin();

			if (!response.success) {
				throw new Error(response.error ?? "Failed to leave meeting");
			}

			currentMeeting.value = null;
		} finally {
			isLoading.value = false;
		}
	}

	return {
		currentMeeting,
		isJoined,
		joinedMeetingId,
		joinedMeetingAdminPoolId,
		isLoading,
		isInitialized,
		loadCurrentMeeting,
		joinMeeting,
		leaveMeeting,
	};
}
