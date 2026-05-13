/**
 * Projector composable for cross-tab communication between control and display pages
 *
 * Uses BroadcastChannel API for real-time, same-origin communication.
 * Falls back to localStorage events for browsers without BroadcastChannel support.
 */
import { ref, onUnmounted, toRaw, type Ref } from "vue";
import {
	ProjectorDisplayMode,
	ProjectorFontFamily,
	ProjectorFontSize,
	type ProjectorState,
} from "@mcdc-convention-voting/shared";

// Constants
const PROJECTOR_CHANNEL_NAME = "cvp-projector-channel";
const PROJECTOR_DISPLAY_PATH = "/projector-display";
const PING_INTERVAL_MS = 5000;
const DISPLAY_INIT_DELAY_MS = 500;

/**
 * Message types for projector communication
 */
interface ProjectorMessage {
	type: "state_update" | "ping" | "pong" | "request_state";
	state?: ProjectorState;
	timestamp: number;
}

// Default colors for custom message
const DEFAULT_FONT_COLOR = "#ffffff";
const DEFAULT_BACKGROUND_COLOR = "#1a1a2e";

/**
 * Default projector state
 */
function createDefaultState(): ProjectorState {
	return {
		mode: ProjectorDisplayMode.Blank,
		meetingId: null,
		motionId: null,
		customMessage: null,
		customMessageFontSize: ProjectorFontSize.Medium,
		customMessageFontFamily: ProjectorFontFamily.SansSerif,
		customMessageFontColor: DEFAULT_FONT_COLOR,
		customMessageBackgroundColor: DEFAULT_BACKGROUND_COLOR,
		customMessageImageUrl: null,
		organizationUrl: null,
		organizationName: null,
		lastUpdated: new Date().toISOString(),
	};
}

// Type for BroadcastChannel to avoid TS issues
type BroadcastChannelType = InstanceType<typeof BroadcastChannel>;

/**
 * Composable for the projector control page
 * Manages sending state to the display page
 */
export function useProjectorControl(): {
	isDisplayConnected: Ref<boolean>;
	currentState: Ref<ProjectorState>;
	openDisplayWindow: () => void;
	sendState: (state: ProjectorState) => void;
	updateMode: (mode: ProjectorDisplayMode) => void;
	updateMeetingId: (meetingId: number | null) => void;
	updateMotionId: (motionId: number | null) => void;
	updateCustomMessage: (message: string | null) => void;
	updateCustomMessageFontSize: (size: ProjectorFontSize) => void;
	updateOrganization: (url: string | null, name: string | null) => void;
	cleanup: () => void;
} {
	const isDisplayConnected = ref(false);
	const currentState = ref<ProjectorState>(createDefaultState());
	let channel: BroadcastChannelType | null = null;
	let pingInterval: ReturnType<typeof setInterval> | null = null;

	// Initialize BroadcastChannel
	function initChannel(): void {
		if (typeof BroadcastChannel === "undefined") {
			// BroadcastChannel not supported
			return;
		}

		channel = new BroadcastChannel(PROJECTOR_CHANNEL_NAME);

		channel.onmessage = ({ data }: MessageEvent<ProjectorMessage>) => {
			const { type } = data;
			if (type === "pong") {
				isDisplayConnected.value = true;
			} else if (type === "request_state") {
				// Display is requesting current state - send it immediately
				// Convert reactive proxy to plain object for BroadcastChannel
				const plainState: ProjectorState = { ...toRaw(currentState.value) };
				if (channel === null) {
					return;
				}
				const message: ProjectorMessage = {
					type: "state_update",
					state: plainState,
					timestamp: Date.now(),
				};
				channel.postMessage(message);
				isDisplayConnected.value = true;
			}
		};

		// Ping display periodically to check connection
		pingInterval = setInterval(() => {
			sendPing();
		}, PING_INTERVAL_MS);

		// Send initial ping
		sendPing();
	}

	function sendPing(): void {
		if (channel === null) return;
		const message: ProjectorMessage = {
			type: "ping",
			timestamp: Date.now(),
		};
		channel.postMessage(message);
	}

	/**
	 * Open the projector display window
	 */
	function openDisplayWindow(): void {
		window.open(
			PROJECTOR_DISPLAY_PATH,
			"projector-display",
			"width=1920,height=1080",
		);

		// Initialize channel if not already done
		if (channel === null) {
			initChannel();
		}

		// Send current state after a short delay to allow display to initialize
		setTimeout(() => {
			sendState(currentState.value);
		}, DISPLAY_INIT_DELAY_MS);
	}

	/**
	 * Send state to the display page
	 */
	function sendState(state: ProjectorState): void {
		// Convert reactive proxy to plain object for state update
		const plainState: ProjectorState = {
			...toRaw(state),
			lastUpdated: new Date().toISOString(),
		};
		currentState.value = plainState;

		if (channel === null) {
			return;
		}
		// Use plain object (not reactive proxy) for BroadcastChannel
		const message: ProjectorMessage = {
			type: "state_update",
			state: plainState,
			timestamp: Date.now(),
		};
		channel.postMessage(message);
	}

	/**
	 * Update just the display mode
	 */
	function updateMode(mode: ProjectorDisplayMode): void {
		sendState({
			...currentState.value,
			mode,
		});
	}

	/**
	 * Update the meeting ID
	 */
	function updateMeetingId(meetingId: number | null): void {
		sendState({
			...currentState.value,
			meetingId,
			// Clear motion when meeting changes
			motionId: null,
		});
	}

	/**
	 * Update the motion ID
	 */
	function updateMotionId(motionId: number | null): void {
		sendState({
			...currentState.value,
			motionId,
		});
	}

	/**
	 * Update the custom message
	 */
	function updateCustomMessage(message: string | null): void {
		sendState({
			...currentState.value,
			customMessage: message,
		});
	}

	/**
	 * Update the custom message font size
	 */
	function updateCustomMessageFontSize(size: ProjectorFontSize): void {
		sendState({
			...currentState.value,
			customMessageFontSize: size,
		});
	}

	/**
	 * Update organization info for QR code
	 */
	function updateOrganization(url: string | null, name: string | null): void {
		sendState({
			...currentState.value,
			organizationUrl: url,
			organizationName: name,
		});
	}

	/**
	 * Cleanup resources
	 */
	function cleanup(): void {
		if (pingInterval !== null) {
			clearInterval(pingInterval);
			pingInterval = null;
		}
		if (channel !== null) {
			channel.close();
			channel = null;
		}
	}

	// Initialize on creation
	initChannel();

	// Cleanup on unmount
	onUnmounted(() => {
		cleanup();
	});

	return {
		isDisplayConnected,
		currentState,
		openDisplayWindow,
		sendState,
		updateMode,
		updateMeetingId,
		updateMotionId,
		updateCustomMessage,
		updateCustomMessageFontSize,
		updateOrganization,
		cleanup,
	};
}

/**
 * Composable for the projector display page
 * Receives state from the control page
 */
export function useProjectorDisplay(): {
	isConnected: Ref<boolean>;
	currentState: Ref<ProjectorState>;
	cleanup: () => void;
} {
	const isConnected = ref(false);
	const currentState = ref<ProjectorState>(createDefaultState());
	let channel: BroadcastChannelType | null = null;

	// Initialize BroadcastChannel
	function initChannel(): void {
		if (typeof BroadcastChannel === "undefined") {
			// BroadcastChannel not supported
			return;
		}

		channel = new BroadcastChannel(PROJECTOR_CHANNEL_NAME);

		channel.onmessage = ({ data }: MessageEvent<ProjectorMessage>) => {
			const { type, state } = data;

			if (type === "ping") {
				// Respond to ping from control
				sendPong();
				isConnected.value = true;
			} else if (type === "state_update" && state !== undefined) {
				// Update state from control
				currentState.value = state;
				isConnected.value = true;
			}
		};
	}

	function sendPong(): void {
		if (channel === null) return;
		const message: ProjectorMessage = {
			type: "pong",
			timestamp: Date.now(),
		};
		channel.postMessage(message);
	}

	function requestState(): void {
		if (channel === null) {
			return;
		}
		const message: ProjectorMessage = {
			type: "request_state",
			timestamp: Date.now(),
		};
		channel.postMessage(message);
	}

	/**
	 * Cleanup resources
	 */
	function cleanup(): void {
		if (channel !== null) {
			channel.close();
			channel = null;
		}
	}

	// Initialize on creation
	initChannel();

	// Request current state from control when display starts
	requestState();

	// Cleanup on unmount
	onUnmounted(() => {
		cleanup();
	});

	return {
		isConnected,
		currentState,
		cleanup,
	};
}
