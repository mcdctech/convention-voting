<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import {
	MotionStatus,
	ProjectorDisplayMode,
	ProjectorFontFamily,
	ProjectorFontSize,
	type Choice,
	type MeetingWithPool,
	type MotionDetailedResults,
	type MotionWithPool,
	type ProjectorState,
	type QuorumReport,
} from "@mcdc-convention-voting/shared";
import QrcodeVue from "qrcode.vue";
import { useCountdownTimer } from "../../composables/useCountdownTimer";
import { useProjectorControl } from "../../composables/useProjector";
import {
	getChoices,
	getMeetings,
	getMotion,
	getMotionDetailedResults,
	getMotions,
	getQuorumReport,
	getUserGuideDownloadUrl,
} from "../../services/api";

// Constants
const DECIMAL_RADIX = 10;
const FIRST_PAGE = 1;
const PAGE_SIZE = 100;
const PREVIEW_REFRESH_INTERVAL_MS = 5000;
const PREVIEW_QR_SIZE = 120;
const DEFAULT_FONT_COLOR = "#ffffff";
const DEFAULT_BACKGROUND_COLOR = "#1a1a2e";
const FIRST_FILE_INDEX = 0;
const MIN_FILES_LENGTH = 0;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

// Projector control composable
const { isDisplayConnected, currentState, openDisplayWindow, sendState } =
	useProjectorControl();

// Data
const meetings = ref<MeetingWithPool[]>([]);
const motions = ref<MotionWithPool[]>([]);
const loadingMeetings = ref(false);
const loadingMotions = ref(false);

// Form state for preview (before projecting)
const previewState = ref<ProjectorState>({
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
});

// Preview data (live data for actual preview)
const quorum = ref<QuorumReport | null>(null);
const detailedResults = ref<MotionDetailedResults | null>(null);
const motionDetail = ref<MotionWithPool | null>(null);
const motionChoices = ref<Choice[]>([]);
let previewRefreshInterval: ReturnType<typeof setInterval> | null = null;

// Countdown timer for voting active motions
const { remainingTimeString, isTimeUrgent, isOvertime } = useCountdownTimer({
	getVotingEndsAt: () => {
		if (motionDetail.value?.status !== MotionStatus.VotingActive) {
			return null;
		}

		if (motionDetail.value.endOverride !== null) {
			return new Date(motionDetail.value.endOverride);
		}

		if (motionDetail.value.votingStartedAt === null) {
			return null;
		}
		const startTime = new Date(motionDetail.value.votingStartedAt);
		const durationMs =
			motionDetail.value.plannedDuration * SECONDS_PER_MINUTE * MS_PER_SECOND;
		return new Date(startTime.getTime() + durationMs);
	},
});

// Display mode options
const displayModes = [
	{ mode: ProjectorDisplayMode.Blank, label: "Blank Screen", icon: "⬛" },
	{
		mode: ProjectorDisplayMode.MeetingTitle,
		label: "Meeting Title",
		icon: "🏛️",
	},
	{ mode: ProjectorDisplayMode.Quorum, label: "Quorum", icon: "👥" },
	{ mode: ProjectorDisplayMode.Motion, label: "Motion", icon: "📋" },
	{ mode: ProjectorDisplayMode.Results, label: "Results", icon: "📊" },
	{
		mode: ProjectorDisplayMode.QRUserGuide,
		label: "QR: User Guide",
		icon: "📱",
	},
	{
		mode: ProjectorDisplayMode.QROrganization,
		label: "QR: Organization",
		icon: "🔗",
	},
	{
		mode: ProjectorDisplayMode.CustomMessage,
		label: "Custom Message",
		icon: "💬",
	},
];

// Motion filter
const showOnlyActiveMotions = ref(false);

// Font size options for custom messages
const fontSizeOptions = [
	{ size: ProjectorFontSize.Small, label: "Small" },
	{ size: ProjectorFontSize.Medium, label: "Medium" },
	{ size: ProjectorFontSize.Large, label: "Large" },
];

// Font family options for custom messages
const fontFamilyOptions = [
	{ family: ProjectorFontFamily.SansSerif, label: "Sans-Serif" },
	{ family: ProjectorFontFamily.Serif, label: "Serif" },
	{ family: ProjectorFontFamily.Monospace, label: "Monospace" },
	{ family: ProjectorFontFamily.Cursive, label: "Script" },
	{ family: ProjectorFontFamily.Display, label: "Display" },
];

// Computed properties
const selectedMeeting = computed(() => {
	if (previewState.value.meetingId === null) return null;
	return meetings.value.find((m) => m.id === previewState.value.meetingId);
});

const requiresMeeting = computed(() => {
	const mode = previewState.value.mode;
	return [
		ProjectorDisplayMode.MeetingTitle,
		ProjectorDisplayMode.Quorum,
		ProjectorDisplayMode.Motion,
		ProjectorDisplayMode.Results,
	].includes(mode);
});

const requiresMotion = computed(() => {
	const mode = previewState.value.mode;
	return [ProjectorDisplayMode.Motion, ProjectorDisplayMode.Results].includes(
		mode,
	);
});

const filteredMotions = computed(() => {
	if (!showOnlyActiveMotions.value) {
		return motions.value;
	}
	return motions.value.filter((m) => m.status === MotionStatus.VotingActive);
});

const isPreviewDifferent = computed(
	() =>
		JSON.stringify(previewState.value) !== JSON.stringify(currentState.value),
);

function hasValidOrganizationUrl(): boolean {
	const url = previewState.value.organizationUrl;
	return url !== null && url.trim() !== "";
}

function hasValidCustomMessage(): boolean {
	const msg = previewState.value.customMessage;
	return msg !== null && msg.trim() !== "";
}

function canProjectMode(mode: ProjectorDisplayMode): boolean {
	// Blank and QR User Guide modes are always valid
	if (mode === ProjectorDisplayMode.Blank) return true;
	if (mode === ProjectorDisplayMode.QRUserGuide) return true;

	// QR Organization requires a URL
	if (mode === ProjectorDisplayMode.QROrganization) {
		return hasValidOrganizationUrl();
	}

	// Custom message requires message text
	if (mode === ProjectorDisplayMode.CustomMessage) {
		return hasValidCustomMessage();
	}

	// Meeting-specific modes require meeting
	if (requiresMeeting.value && previewState.value.meetingId === null) {
		return false;
	}

	// Motion-specific modes require motion
	if (requiresMotion.value && previewState.value.motionId === null) {
		return false;
	}

	return true;
}

const canProject = computed(() => canProjectMode(previewState.value.mode));

const userGuideUrl = computed(() => getUserGuideDownloadUrl());

// Load data
async function loadMeetings(): Promise<void> {
	loadingMeetings.value = true;
	try {
		const response = await getMeetings(FIRST_PAGE, PAGE_SIZE);
		if (response.success && response.data !== undefined) {
			meetings.value = response.data;
		}
	} catch {
		// Silently fail
	} finally {
		loadingMeetings.value = false;
	}
}

async function loadMotions(meetingId: number): Promise<void> {
	loadingMotions.value = true;
	try {
		const response = await getMotions(meetingId);
		if (response.success && response.data !== undefined) {
			motions.value = response.data;
		}
	} catch {
		motions.value = [];
	} finally {
		loadingMotions.value = false;
	}
}

// Preview data loading functions
async function loadQuorum(meetingId: number): Promise<void> {
	try {
		const response = await getQuorumReport(meetingId);
		if (response.success && response.data !== undefined) {
			quorum.value = response.data;
		}
	} catch {
		quorum.value = null;
	}
}

async function loadMotionDetail(motionId: number): Promise<void> {
	try {
		const [motionResponse, choicesResponse] = await Promise.all([
			getMotion(motionId),
			getChoices(motionId),
		]);
		if (motionResponse.success && motionResponse.data !== undefined) {
			motionDetail.value = motionResponse.data;
		}
		if (choicesResponse.success && choicesResponse.data !== undefined) {
			motionChoices.value = choicesResponse.data;
		}
	} catch {
		motionDetail.value = null;
		motionChoices.value = [];
	}
}

async function loadDetailedResults(motionId: number): Promise<void> {
	try {
		const response = await getMotionDetailedResults(motionId);
		if (response.success && response.data !== undefined) {
			detailedResults.value = response.data;
		}
	} catch {
		detailedResults.value = null;
	}
}

function loadPreviewData(): void {
	const { meetingId, motionId, mode } = previewState.value;

	// Load quorum data if in quorum mode
	if (mode === ProjectorDisplayMode.Quorum && meetingId !== null) {
		void loadQuorum(meetingId);
	}

	// Load motion detail if needed
	if (motionId !== null) {
		void loadMotionDetail(motionId);
	}

	// Load detailed results if in results mode
	if (mode === ProjectorDisplayMode.Results && motionId !== null) {
		void loadDetailedResults(motionId);
	}
}

function setupPreviewRefresh(): void {
	// Clear existing interval
	if (previewRefreshInterval !== null) {
		clearInterval(previewRefreshInterval);
		previewRefreshInterval = null;
	}

	// Set up periodic refresh for live data modes
	const mode = previewState.value.mode;
	const needsRefresh = [
		ProjectorDisplayMode.Quorum,
		ProjectorDisplayMode.Results,
	].includes(mode);

	if (needsRefresh) {
		loadPreviewData();
		previewRefreshInterval = setInterval(
			loadPreviewData,
			PREVIEW_REFRESH_INTERVAL_MS,
		);
	}
}

// Event handlers
function selectMode(mode: ProjectorDisplayMode): void {
	previewState.value = {
		...previewState.value,
		mode,
	};
}

function handleMeetingChange(event: Event): void {
	if (!(event.target instanceof HTMLSelectElement)) return;
	const meetingId =
		event.target.value === ""
			? null
			: parseInt(event.target.value, DECIMAL_RADIX);
	previewState.value = {
		...previewState.value,
		meetingId,
		motionId: null,
	};

	if (meetingId === null) {
		motions.value = [];
	} else {
		void loadMotions(meetingId);
	}
}

function handleMotionChange(event: Event): void {
	if (!(event.target instanceof HTMLSelectElement)) return;
	const motionId =
		event.target.value === ""
			? null
			: parseInt(event.target.value, DECIMAL_RADIX);
	previewState.value = {
		...previewState.value,
		motionId,
	};
}

function handleCustomMessageChange(event: Event): void {
	if (!(event.target instanceof HTMLTextAreaElement)) return;
	previewState.value = {
		...previewState.value,
		customMessage: event.target.value,
	};
}

function handleFontSizeChange(size: ProjectorFontSize): void {
	previewState.value = {
		...previewState.value,
		customMessageFontSize: size,
	};
}

function handleFontFamilyChange(family: ProjectorFontFamily): void {
	previewState.value = {
		...previewState.value,
		customMessageFontFamily: family,
	};
}

function handleFontColorChange(event: Event): void {
	if (!(event.target instanceof HTMLInputElement)) return;
	previewState.value = {
		...previewState.value,
		customMessageFontColor: event.target.value,
	};
}

function handleBackgroundColorChange(event: Event): void {
	if (!(event.target instanceof HTMLInputElement)) return;
	previewState.value = {
		...previewState.value,
		customMessageBackgroundColor: event.target.value,
	};
}

function handleImageUpload(event: Event): void {
	if (!(event.target instanceof HTMLInputElement)) return;
	const files = event.target.files;
	if (files === null || files.length === MIN_FILES_LENGTH) return;

	const file = files[FIRST_FILE_INDEX];
	const reader = new FileReader();
	reader.onload = (e: ProgressEvent<FileReader>) => {
		const result = e.target?.result;
		if (typeof result === "string") {
			previewState.value = {
				...previewState.value,
				customMessageImageUrl: result,
			};
		}
	};
	reader.readAsDataURL(file);
}

function removeImage(): void {
	previewState.value = {
		...previewState.value,
		customMessageImageUrl: null,
	};
}

function handleOrganizationUrlChange(event: Event): void {
	if (!(event.target instanceof HTMLInputElement)) return;
	previewState.value = {
		...previewState.value,
		organizationUrl: event.target.value,
	};
}

function handleOrganizationNameChange(event: Event): void {
	if (!(event.target instanceof HTMLInputElement)) return;
	previewState.value = {
		...previewState.value,
		organizationName: event.target.value,
	};
}

function projectNow(): void {
	sendState(previewState.value);
}

function handleOpenDisplay(): void {
	openDisplayWindow();
}

// Watch for meeting changes to load motions
watch(
	() => previewState.value.meetingId,
	(newMeetingId) => {
		if (newMeetingId !== null) {
			void loadMotions(newMeetingId);
		}
		// Reset preview data when meeting changes
		quorum.value = null;
		setupPreviewRefresh();
	},
);

// Watch for motion changes to load motion data
watch(
	() => previewState.value.motionId,
	(newMotionId) => {
		if (newMotionId !== null) {
			void loadMotionDetail(newMotionId);
		}
		// Reset preview data when motion changes
		detailedResults.value = null;
		setupPreviewRefresh();
	},
);

// Watch for mode changes to refresh preview data
watch(
	() => previewState.value.mode,
	() => {
		setupPreviewRefresh();
	},
);

// Initialize
onMounted(() => {
	void loadMeetings();
});

// Cleanup on unmount
onUnmounted(() => {
	if (previewRefreshInterval !== null) {
		clearInterval(previewRefreshInterval);
	}
});
</script>

<template>
	<div class="projector-control">
		<div class="header">
			<h2>Projector Control</h2>
			<div class="header-actions">
				<span v-if="isDisplayConnected" class="connection-status connected">
					Display Connected
				</span>
				<span v-else class="connection-status disconnected">
					Display Not Connected
				</span>
				<button class="btn btn-primary" @click="handleOpenDisplay">
					Open Display Window
				</button>
			</div>
		</div>

		<div class="control-panel">
			<!-- Meeting Selection -->
			<div class="section">
				<h3>Meeting</h3>
				<select
					:value="previewState.meetingId ?? ''"
					:disabled="loadingMeetings"
					@change="handleMeetingChange"
				>
					<option value="">
						{{ loadingMeetings ? "Loading..." : "Select a meeting..." }}
					</option>
					<option
						v-for="meeting in meetings"
						:key="meeting.id"
						:value="meeting.id"
					>
						{{ meeting.name }}
					</option>
				</select>
			</div>

			<!-- Motion Selection (when required) -->
			<div v-if="requiresMotion" class="section">
				<h3>Motion</h3>
				<select
					:value="previewState.motionId ?? ''"
					:disabled="loadingMotions || previewState.meetingId === null"
					@change="handleMotionChange"
				>
					<option value="">
						{{
							loadingMotions
								? "Loading..."
								: previewState.meetingId === null
									? "Select a meeting first..."
									: "Select a motion..."
						}}
					</option>
					<option
						v-for="motion in filteredMotions"
						:key="motion.id"
						:value="motion.id"
					>
						{{ motion.name }}
					</option>
				</select>
				<label class="filter-checkbox">
					<input v-model="showOnlyActiveMotions" type="checkbox" />
					<span>Show only active motions</span>
				</label>
			</div>

			<!-- Display Mode Selection -->
			<div class="section">
				<h3>Display Mode</h3>
				<div class="mode-grid">
					<button
						v-for="modeOption in displayModes"
						:key="modeOption.mode"
						class="mode-button"
						:class="{ active: previewState.mode === modeOption.mode }"
						@click="selectMode(modeOption.mode)"
					>
						<span class="mode-icon">{{ modeOption.icon }}</span>
						<span class="mode-label">{{ modeOption.label }}</span>
					</button>
				</div>
			</div>

			<!-- Custom Message Editor -->
			<div
				v-if="previewState.mode === ProjectorDisplayMode.CustomMessage"
				class="section"
			>
				<h3>Custom Message</h3>
				<textarea
					:value="previewState.customMessage ?? ''"
					placeholder="Enter your message here..."
					rows="5"
					@input="handleCustomMessageChange"
				/>

				<div class="styling-options">
					<!-- Font Size -->
					<div class="styling-row">
						<span class="styling-label">Font Size:</span>
						<div class="styling-buttons">
							<button
								v-for="sizeOption in fontSizeOptions"
								:key="sizeOption.size"
								class="style-btn"
								:class="{
									active:
										previewState.customMessageFontSize === sizeOption.size,
								}"
								@click="handleFontSizeChange(sizeOption.size)"
							>
								{{ sizeOption.label }}
							</button>
						</div>
					</div>

					<!-- Font Family -->
					<div class="styling-row">
						<span class="styling-label">Font:</span>
						<div class="styling-buttons">
							<button
								v-for="familyOption in fontFamilyOptions"
								:key="familyOption.family"
								class="style-btn"
								:class="{
									active:
										previewState.customMessageFontFamily ===
										familyOption.family,
								}"
								@click="handleFontFamilyChange(familyOption.family)"
							>
								{{ familyOption.label }}
							</button>
						</div>
					</div>

					<!-- Colors -->
					<div class="styling-row">
						<span class="styling-label">Colors:</span>
						<div class="color-inputs">
							<div class="color-input-group">
								<label for="font-color">Text</label>
								<input
									id="font-color"
									type="color"
									:value="previewState.customMessageFontColor"
									@input="handleFontColorChange"
								/>
							</div>
							<div class="color-input-group">
								<label for="bg-color">Background</label>
								<input
									id="bg-color"
									type="color"
									:value="previewState.customMessageBackgroundColor"
									@input="handleBackgroundColorChange"
								/>
							</div>
						</div>
					</div>

					<!-- Image Upload -->
					<div class="styling-row">
						<span class="styling-label">Image:</span>
						<div class="image-controls">
							<input
								id="image-upload"
								type="file"
								accept="image/*"
								class="image-input"
								@change="handleImageUpload"
							/>
							<label for="image-upload" class="image-upload-btn">
								{{
									previewState.customMessageImageUrl
										? "Change Image"
										: "Add Image"
								}}
							</label>
							<button
								v-if="previewState.customMessageImageUrl"
								class="remove-image-btn"
								@click="removeImage"
							>
								Remove
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- Organization QR Code Settings -->
			<div
				v-if="previewState.mode === ProjectorDisplayMode.QROrganization"
				class="section"
			>
				<h3>Organization QR Code</h3>
				<div class="form-group">
					<label for="org-url">Website URL</label>
					<input
						id="org-url"
						type="url"
						:value="previewState.organizationUrl ?? ''"
						placeholder="https://example.org"
						@input="handleOrganizationUrlChange"
					/>
				</div>
				<div class="form-group">
					<label for="org-name">Organization Name</label>
					<input
						id="org-name"
						type="text"
						:value="previewState.organizationName ?? ''"
						placeholder="Organization Name"
						@input="handleOrganizationNameChange"
					/>
				</div>
			</div>

			<!-- Preview Section -->
			<div class="section preview-section">
				<h3>Preview</h3>
				<div
					class="preview-container"
					:style="{
						backgroundColor:
							previewState.mode === ProjectorDisplayMode.CustomMessage
								? previewState.customMessageBackgroundColor
								: '#1a1a2e',
					}"
				>
					<!-- Blank -->
					<div
						v-if="previewState.mode === ProjectorDisplayMode.Blank"
						class="preview-content blank"
					>
						<span class="preview-text muted">Blank Screen</span>
					</div>

					<!-- Meeting Title -->
					<div
						v-else-if="previewState.mode === ProjectorDisplayMode.MeetingTitle"
						class="preview-content meeting-title"
					>
						<h4 v-if="selectedMeeting">{{ selectedMeeting.name }}</h4>
						<p v-if="selectedMeeting?.description" class="meeting-desc">
							{{ selectedMeeting.description }}
						</p>
						<span v-if="!selectedMeeting" class="preview-text muted"
							>Select a meeting to preview</span
						>
					</div>

					<!-- Quorum -->
					<div
						v-else-if="previewState.mode === ProjectorDisplayMode.Quorum"
						class="preview-content"
					>
						<div v-if="selectedMeeting && quorum" class="preview-quorum">
							<h4>{{ selectedMeeting.name }}</h4>
							<div
								class="quorum-status"
								:class="{ achieved: quorum.hasQuorum }"
							>
								{{
									quorum.hasQuorum ? "Quorum Achieved" : "Quorum Not Reached"
								}}
							</div>
							<div class="quorum-numbers">
								<div class="stat">
									<span class="value">{{ quorum.activeVoterCount }}</span>
									<span class="label">Present</span>
								</div>
								<div class="stat">
									<span class="value">{{ quorum.votersNeededForQuorum }}</span>
									<span class="label"
										>Required ({{ quorum.quorumPercentage }}%)</span
									>
								</div>
								<div class="stat">
									<span class="value">{{ quorum.totalEligibleVoters }}</span>
									<span class="label">Eligible</span>
								</div>
							</div>
							<div class="quorum-percentage">
								{{ quorum.activeVoterPercentage.toFixed(1) }}%
							</div>
						</div>
						<div v-else-if="selectedMeeting" class="preview-loading">
							Loading quorum data...
						</div>
						<span v-else class="preview-text muted"
							>Select a meeting to preview</span
						>
					</div>

					<!-- Motion Display -->
					<div
						v-else-if="previewState.mode === ProjectorDisplayMode.Motion"
						class="preview-content preview-motion"
					>
						<div v-if="motionDetail" class="motion-preview-content">
							<!-- Status indicator -->
							<div class="motion-status-row">
								<span
									class="motion-status-badge"
									:class="{
										'status-not-started':
											motionDetail.status === MotionStatus.NotYetStarted,
										'status-active':
											motionDetail.status === MotionStatus.VotingActive,
										'status-complete':
											motionDetail.status === MotionStatus.VotingComplete,
									}"
								>
									{{
										motionDetail.status === MotionStatus.NotYetStarted
											? "Not Started"
											: motionDetail.status === MotionStatus.VotingActive
												? "Voting Active"
												: "Complete"
									}}
								</span>
								<span
									v-if="motionDetail.status === MotionStatus.VotingActive"
									class="countdown-badge"
									:class="{ urgent: isTimeUrgent, overtime: isOvertime }"
								>
									{{ remainingTimeString }}
								</span>
							</div>
							<h3 class="motion-preview-title">{{ motionDetail.name }}</h3>
							<p
								v-if="motionDetail.description"
								class="motion-preview-description"
							>
								{{ motionDetail.description }}
							</p>
							<div v-if="motionChoices.length > 0" class="motion-choices">
								<div
									v-for="choice in motionChoices"
									:key="choice.id"
									class="motion-choice"
								>
									{{ choice.name }}
								</div>
							</div>
						</div>
						<span v-else class="preview-text muted"
							>Select a motion to preview</span
						>
					</div>

					<!-- Results -->
					<div
						v-else-if="previewState.mode === ProjectorDisplayMode.Results"
						class="preview-content"
					>
						<!-- Motion not yet started -->
						<div
							v-if="
								motionDetail &&
								motionDetail.status === MotionStatus.NotYetStarted
							"
							class="preview-results"
						>
							<h4>Results: {{ motionDetail.name }}</h4>
							<div class="results-message-preview">
								Motion has not yet been voted upon.
							</div>
						</div>
						<!-- Motion voting active -->
						<div
							v-else-if="
								motionDetail &&
								motionDetail.status === MotionStatus.VotingActive
							"
							class="preview-results"
						>
							<h4>Results: {{ motionDetail.name }}</h4>
							<div class="results-message-preview">
								Motion Active - No results available to report.
							</div>
						</div>
						<!-- Motion voting complete - show results -->
						<div
							v-else-if="motionDetail && detailedResults"
							class="preview-results"
						>
							<h4>Results: {{ motionDetail.name }}</h4>
							<div class="results-preview">
								<div
									v-for="(result, index) in detailedResults.choiceResults.slice(
										0,
										3,
									)"
									:key="result.choiceId"
									class="result-row"
									:class="{ winner: index === 0 }"
								>
									<span class="choice-name">{{ result.choiceName }}</span>
									<span class="vote-count"
										>{{ result.voteCount }} ({{
											result.percentage.toFixed(0)
										}}%)</span
									>
								</div>
							</div>
						</div>
						<div v-else-if="motionDetail" class="preview-loading">
							Loading results...
						</div>
						<span v-else class="preview-text muted"
							>Select a motion to preview</span
						>
					</div>

					<!-- QR User Guide -->
					<div
						v-else-if="previewState.mode === ProjectorDisplayMode.QRUserGuide"
						class="preview-content"
					>
						<div class="preview-qr">
							<p class="qr-title">User Guide</p>
							<div class="qr-wrapper">
								<QrcodeVue
									:value="userGuideUrl"
									:size="PREVIEW_QR_SIZE"
									level="M"
									background="#ffffff"
									foreground="#000000"
								/>
							</div>
							<p class="preview-text muted small">Scan to download</p>
						</div>
					</div>

					<!-- QR Organization -->
					<div
						v-else-if="
							previewState.mode === ProjectorDisplayMode.QROrganization
						"
						class="preview-content"
					>
						<div class="preview-qr">
							<p v-if="previewState.organizationName" class="qr-title">
								{{ previewState.organizationName }}
							</p>
							<div v-if="previewState.organizationUrl" class="qr-wrapper">
								<QrcodeVue
									:value="previewState.organizationUrl"
									:size="PREVIEW_QR_SIZE"
									level="M"
									background="#ffffff"
									foreground="#000000"
								/>
							</div>
							<span v-else class="preview-text muted"
								>Enter organization URL above</span
							>
						</div>
					</div>

					<!-- Custom Message -->
					<div
						v-else-if="previewState.mode === ProjectorDisplayMode.CustomMessage"
						class="preview-content custom-message-preview"
					>
						<img
							v-if="previewState.customMessageImageUrl"
							:src="previewState.customMessageImageUrl"
							class="custom-image"
							alt="Custom artwork"
						/>
						<div
							v-if="previewState.customMessage"
							class="preview-message"
							:class="[
								`font-${previewState.customMessageFontSize}`,
								`font-family-${previewState.customMessageFontFamily}`,
							]"
							:style="{ color: previewState.customMessageFontColor }"
						>
							{{ previewState.customMessage }}
						</div>
						<span
							v-if="
								!previewState.customMessage &&
								!previewState.customMessageImageUrl
							"
							class="preview-text muted"
							>Enter a message or add an image above</span
						>
					</div>
				</div>
			</div>

			<!-- Project Button -->
			<div class="section actions-section">
				<button
					class="btn btn-success btn-large"
					:disabled="!canProject || !isPreviewDifferent"
					@click="projectNow"
				>
					{{
						!isPreviewDifferent
							? "Already Projected"
							: canProject
								? "Project Now"
								: "Complete Settings to Project"
					}}
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.projector-control {
	max-width: 900px;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1.5rem;
	flex-wrap: wrap;
	gap: 1rem;
}

.header h2 {
	margin: 0;
	color: #2c3e50;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.connection-status {
	padding: 0.5rem 1rem;
	border-radius: 20px;
	font-size: 0.875rem;
	font-weight: 500;
}

.connection-status.connected {
	background: #e8f5e9;
	color: #2e7d32;
}

.connection-status.disconnected {
	background: #fff3e0;
	color: #e65100;
}

.control-panel {
	background: white;
	border-radius: 8px;
	padding: 1.5rem;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.section {
	margin-bottom: 1.5rem;
}

.section:last-child {
	margin-bottom: 0;
}

.section h3 {
	margin: 0 0 0.75rem 0;
	font-size: 1rem;
	font-weight: 600;
	color: #2c3e50;
}

select,
input[type="url"],
input[type="text"],
textarea {
	width: 100%;
	padding: 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	font-size: 1rem;
	font-family: inherit;
}

select:focus,
input:focus,
textarea:focus {
	outline: none;
	border-color: #1976d2;
}

select:disabled,
input:disabled,
textarea:disabled {
	background: #f5f5f5;
	cursor: not-allowed;
}

.filter-checkbox {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin-top: 0.5rem;
	font-size: 0.875rem;
	color: #666;
	cursor: pointer;
}

.filter-checkbox input[type="checkbox"] {
	width: 1rem;
	height: 1rem;
	cursor: pointer;
}

.form-group {
	margin-bottom: 1rem;
}

.form-group:last-child {
	margin-bottom: 0;
}

.form-group label {
	display: block;
	margin-bottom: 0.5rem;
	font-weight: 500;
	color: #666;
}

.mode-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
	gap: 0.75rem;
}

.mode-button {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 1rem;
	border: 2px solid #e0e0e0;
	border-radius: 8px;
	background: white;
	cursor: pointer;
	transition: all 0.2s;
}

.mode-button:hover {
	border-color: #1976d2;
	background: #f5f9ff;
}

.mode-button.active {
	border-color: #1976d2;
	background: #e3f2fd;
}

.mode-icon {
	font-size: 1.5rem;
	margin-bottom: 0.5rem;
}

.mode-label {
	font-size: 0.875rem;
	text-align: center;
	color: #2c3e50;
}

/* Custom message styling options */
.styling-options {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	margin-top: 1rem;
	padding: 1rem;
	background: #f9f9f9;
	border-radius: 8px;
}

.styling-row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	flex-wrap: wrap;
}

.styling-label {
	font-size: 0.875rem;
	color: #666;
	min-width: 80px;
	font-weight: 500;
}

.styling-buttons {
	display: flex;
	gap: 0.375rem;
	flex-wrap: wrap;
}

.style-btn {
	padding: 0.375rem 0.75rem;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	background: white;
	cursor: pointer;
	font-size: 0.8125rem;
	transition: all 0.2s;
}

.style-btn:hover {
	border-color: #1976d2;
}

.style-btn.active {
	border-color: #1976d2;
	background: #e3f2fd;
	color: #1976d2;
}

.color-inputs {
	display: flex;
	gap: 1rem;
}

.color-input-group {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.color-input-group label {
	font-size: 0.8125rem;
	color: #666;
}

.color-input-group input[type="color"] {
	width: 36px;
	height: 36px;
	padding: 2px;
	border: 1px solid #e0e0e0;
	border-radius: 4px;
	cursor: pointer;
}

.image-controls {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.image-input {
	display: none;
}

.image-upload-btn {
	padding: 0.375rem 0.75rem;
	border: 1px solid #1976d2;
	border-radius: 4px;
	background: white;
	color: #1976d2;
	cursor: pointer;
	font-size: 0.8125rem;
	transition: all 0.2s;
}

.image-upload-btn:hover {
	background: #e3f2fd;
}

.remove-image-btn {
	padding: 0.375rem 0.75rem;
	border: 1px solid #e57373;
	border-radius: 4px;
	background: white;
	color: #e57373;
	cursor: pointer;
	font-size: 0.8125rem;
	transition: all 0.2s;
}

.remove-image-btn:hover {
	background: #ffebee;
}

.preview-section {
	margin-top: 2rem;
	padding-top: 1.5rem;
	border-top: 1px solid #e0e0e0;
}

.preview-container {
	background: #1a1a2e;
	border-radius: 8px;
	padding: 2rem;
	aspect-ratio: 16 / 9;
	width: 100%;
	max-width: 640px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.preview-content {
	text-align: center;
	color: white;
}

.preview-content h4 {
	margin: 0 0 0.5rem 0;
	font-size: 1.5rem;
	font-weight: 600;
}

.preview-content p {
	margin: 0.5rem 0;
}

.preview-text {
	color: #999;
}

.preview-text.muted {
	font-style: italic;
}

.preview-text.small {
	font-size: 0.75rem;
	word-break: break-all;
}

.preview-content.blank {
	opacity: 0.5;
}

.preview-qr {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.qr-placeholder {
	font-size: 3rem;
}

.preview-message {
	white-space: pre-wrap;
	word-break: break-word;
}

.preview-message.font-small {
	font-size: 0.75rem;
}

.preview-message.font-medium {
	font-size: 1rem;
}

.preview-message.font-large {
	font-size: 1.25rem;
}

/* Font family classes */
.preview-message.font-family-sans-serif {
	font-family:
		system-ui,
		-apple-system,
		sans-serif;
}

.preview-message.font-family-serif {
	font-family: Georgia, "Times New Roman", serif;
}

.preview-message.font-family-monospace {
	font-family: "Courier New", Consolas, monospace;
}

.preview-message.font-family-cursive {
	font-family: "Brush Script MT", cursive;
}

.preview-message.font-family-display {
	font-family: Impact, "Arial Black", sans-serif;
}

/* Preview content enhancements */
.preview-loading {
	color: rgba(255, 255, 255, 0.6);
	font-size: 0.875rem;
}

.meeting-title h4 {
	font-size: 1.25rem;
	margin-bottom: 0.5rem;
}

.meeting-desc {
	font-size: 0.75rem;
	color: rgba(255, 255, 255, 0.7);
}

/* Quorum preview */
.preview-quorum {
	text-align: center;
}

.preview-quorum h4 {
	font-size: 0.875rem;
	margin-bottom: 0.5rem;
}

.quorum-status {
	font-size: 0.625rem;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	background: rgba(244, 67, 54, 0.3);
	color: #ff6b6b;
	margin-bottom: 0.5rem;
}

.quorum-status.achieved {
	background: rgba(76, 175, 80, 0.3);
	color: #81c784;
}

.quorum-numbers {
	display: flex;
	gap: 1.5rem;
	justify-content: center;
	margin-bottom: 0.5rem;
}

.quorum-numbers .stat {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.125rem;
}

.quorum-numbers .value {
	font-size: 1rem;
	font-weight: 700;
}

.quorum-numbers .label {
	font-size: 0.5rem;
	color: rgba(255, 255, 255, 0.6);
	text-transform: uppercase;
}

.quorum-percentage {
	font-size: 0.625rem;
	color: rgba(255, 255, 255, 0.7);
}

/* Motion preview - projector style */
.preview-motion {
	text-align: center;
	padding: 0.5rem;
}

.motion-preview-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.motion-status-row {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	flex-wrap: wrap;
	justify-content: center;
}

.motion-status-badge {
	font-size: 0.5rem;
	padding: 0.125rem 0.375rem;
	border-radius: 3px;
	font-weight: 600;
}

.motion-status-badge.status-not-started {
	background: rgba(158, 158, 158, 0.3);
	color: #bdbdbd;
}

.motion-status-badge.status-active {
	background: rgba(76, 175, 80, 0.3);
	color: #81c784;
}

.motion-status-badge.status-complete {
	background: rgba(33, 150, 243, 0.3);
	color: #64b5f6;
}

.countdown-badge {
	font-size: 0.5rem;
	padding: 0.125rem 0.375rem;
	border-radius: 3px;
	font-weight: 600;
	background: rgba(255, 255, 255, 0.1);
	color: white;
}

.countdown-badge.urgent {
	background: rgba(255, 152, 0, 0.3);
	color: #ffb74d;
}

.countdown-badge.overtime {
	background: rgba(244, 67, 54, 0.3);
	color: #ef5350;
}

.motion-preview-title {
	font-size: 0.875rem;
	font-weight: 700;
	margin: 0;
	color: white;
}

.motion-preview-description {
	font-size: 0.5rem;
	color: rgba(255, 255, 255, 0.7);
	margin: 0;
	max-width: 90%;
}

.motion-choices {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
	justify-content: center;
	margin-top: 0.25rem;
}

.motion-choice {
	font-size: 0.5rem;
	padding: 0.25rem 0.5rem;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 4px;
	border: 1px solid rgba(255, 255, 255, 0.2);
	color: white;
}

/* Results preview */
.preview-results h4 {
	font-size: 0.75rem;
	margin-bottom: 0.5rem;
}

.results-preview {
	width: 100%;
}

.results-preview .result-row {
	display: flex;
	justify-content: space-between;
	padding: 0.25rem 0.5rem;
	margin-bottom: 0.25rem;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 4px;
	font-size: 0.5rem;
}

.results-preview .result-row.winner {
	background: rgba(76, 175, 80, 0.3);
}

.results-message-preview {
	font-size: 0.625rem;
	color: rgba(255, 255, 255, 0.8);
	padding: 0.5rem;
	text-align: center;
	font-style: italic;
}

/* QR preview */
.preview-qr {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.qr-title {
	font-size: 0.75rem;
	font-weight: 600;
	margin: 0;
}

.qr-wrapper {
	padding: 0.5rem;
	background: white;
	border-radius: 8px;
}

/* Custom message preview */
.custom-message-preview {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.custom-image {
	max-width: 80%;
	max-height: 40%;
	object-fit: contain;
	border-radius: 8px;
}

.actions-section {
	margin-top: 2rem;
	padding-top: 1.5rem;
	border-top: 1px solid #e0e0e0;
	text-align: center;
}

.btn {
	padding: 0.75rem 1.5rem;
	border: none;
	border-radius: 4px;
	font-size: 1rem;
	cursor: pointer;
	transition: background-color 0.2s;
}

.btn:disabled {
	background-color: #bdbdbd;
	cursor: not-allowed;
}

.btn-primary {
	background-color: #1976d2;
	color: white;
}

.btn-primary:hover:not(:disabled) {
	background-color: #1565c0;
}

.btn-success {
	background-color: #4caf50;
	color: white;
}

.btn-success:hover:not(:disabled) {
	background-color: #43a047;
}

.btn-large {
	padding: 1rem 2rem;
	font-size: 1.125rem;
	font-weight: 600;
}
</style>
