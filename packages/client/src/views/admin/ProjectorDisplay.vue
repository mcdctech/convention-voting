<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
	MotionStatus,
	ProjectorDisplayMode,
	ProjectorFontFamily,
	ProjectorFontSize,
	type Choice,
	type MeetingWithPool,
	type MotionDetailedResults,
	type MotionVoteStats,
	type MotionWithPool,
	type QuorumReport,
} from "@mcdc-convention-voting/shared";
import QrcodeVue from "qrcode.vue";
import { useCountdownTimer } from "../../composables/useCountdownTimer";
import { useProjectorDisplay } from "../../composables/useProjector";
import {
	getChoices,
	getMeeting,
	getMotion,
	getMotionDetailedResults,
	getMotionVoteStats,
	getQuorumReport,
	getUserGuideDownloadUrl,
} from "../../services/api";

// QR code size constant
const QR_CODE_SIZE = 350;

// Constants
const DATA_REFRESH_INTERVAL_MS = 3000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

// Projector display composable
const { currentState, cleanup } = useProjectorDisplay();

// Data from API
const meeting = ref<MeetingWithPool | null>(null);
const motion = ref<MotionWithPool | null>(null);
const choices = ref<Choice[]>([]);
const quorum = ref<QuorumReport | null>(null);
const voteStats = ref<MotionVoteStats | null>(null);
const detailedResults = ref<MotionDetailedResults | null>(null);

// Refresh intervals
let meetingRefreshInterval: ReturnType<typeof setInterval> | null = null;
let motionRefreshInterval: ReturnType<typeof setInterval> | null = null;
let quorumRefreshInterval: ReturnType<typeof setInterval> | null = null;
let voteRefreshInterval: ReturnType<typeof setInterval> | null = null;

// Countdown timer for voting active motions
const { remainingTimeString, isTimeUrgent, isOvertime } = useCountdownTimer({
	getVotingEndsAt: () => {
		if (motion.value?.status !== MotionStatus.VotingActive) {
			return null;
		}

		if (motion.value.endOverride !== null) {
			return new Date(motion.value.endOverride);
		}

		if (motion.value.votingStartedAt === null) {
			return null;
		}
		const startTime = new Date(motion.value.votingStartedAt);
		const durationMs =
			motion.value.plannedDuration * SECONDS_PER_MINUTE * MS_PER_SECOND;
		return new Date(startTime.getTime() + durationMs);
	},
});

// Computed values
const mode = computed(() => currentState.value.mode);
const isBlank = computed(() => mode.value === ProjectorDisplayMode.Blank);

const fontSizeClass = computed(() => {
	switch (currentState.value.customMessageFontSize) {
		case ProjectorFontSize.Small:
			return "font-small";
		case ProjectorFontSize.Large:
			return "font-large";
		default:
			return "font-medium";
	}
});

const fontFamilyClass = computed(() => {
	switch (currentState.value.customMessageFontFamily) {
		case ProjectorFontFamily.Serif:
			return "font-family-serif";
		case ProjectorFontFamily.Monospace:
			return "font-family-monospace";
		case ProjectorFontFamily.Cursive:
			return "font-family-cursive";
		case ProjectorFontFamily.Display:
			return "font-family-display";
		default:
			return "font-family-sans-serif";
	}
});

const customMessageBackgroundColor = computed(
	() => currentState.value.customMessageBackgroundColor,
);

const userGuideUrl = computed(() => getUserGuideDownloadUrl());

// Data loading functions
async function loadMeeting(meetingId: number): Promise<void> {
	try {
		const response = await getMeeting(meetingId);
		if (response.success && response.data !== undefined) {
			meeting.value = response.data;
		}
	} catch {
		// Silently fail
	}
}

async function loadMotion(motionId: number): Promise<void> {
	try {
		const [motionResponse, choicesResponse] = await Promise.all([
			getMotion(motionId),
			getChoices(motionId),
		]);
		if (motionResponse.success && motionResponse.data !== undefined) {
			motion.value = motionResponse.data;
		}
		if (choicesResponse.success && choicesResponse.data !== undefined) {
			choices.value = choicesResponse.data;
		}
	} catch {
		// Silently fail
	}
}

async function loadQuorum(meetingId: number): Promise<void> {
	try {
		const response = await getQuorumReport(meetingId);
		if (response.success && response.data !== undefined) {
			quorum.value = response.data;
		}
	} catch {
		// Silently fail
	}
}

async function loadVoteStats(motionId: number): Promise<void> {
	try {
		const response = await getMotionVoteStats(motionId);
		if (response.success && response.data !== undefined) {
			voteStats.value = response.data;
		}
	} catch {
		// Silently fail
	}
}

async function loadDetailedResults(motionId: number): Promise<void> {
	try {
		const response = await getMotionDetailedResults(motionId);
		if (response.success && response.data !== undefined) {
			detailedResults.value = response.data;
		}
	} catch {
		// Silently fail
	}
}

// Interval management
function clearAllIntervals(): void {
	if (meetingRefreshInterval !== null) {
		clearInterval(meetingRefreshInterval);
		meetingRefreshInterval = null;
	}
	if (motionRefreshInterval !== null) {
		clearInterval(motionRefreshInterval);
		motionRefreshInterval = null;
	}
	if (quorumRefreshInterval !== null) {
		clearInterval(quorumRefreshInterval);
		quorumRefreshInterval = null;
	}
	if (voteRefreshInterval !== null) {
		clearInterval(voteRefreshInterval);
		voteRefreshInterval = null;
	}
}

function setupDataRefresh(): void {
	clearAllIntervals();

	const meetingId = currentState.value.meetingId;
	const motionId = currentState.value.motionId;
	const displayMode = currentState.value.mode;

	// Load meeting data if needed
	if (meetingId !== null) {
		void loadMeeting(meetingId);
		meetingRefreshInterval = setInterval(() => {
			void loadMeeting(meetingId);
		}, DATA_REFRESH_INTERVAL_MS);
	}

	// Load quorum data if in quorum mode
	if (displayMode === ProjectorDisplayMode.Quorum && meetingId !== null) {
		void loadQuorum(meetingId);
		quorumRefreshInterval = setInterval(() => {
			void loadQuorum(meetingId);
		}, DATA_REFRESH_INTERVAL_MS);
	}

	// Load motion data if needed
	if (motionId !== null) {
		void loadMotion(motionId);
		motionRefreshInterval = setInterval(() => {
			void loadMotion(motionId);
		}, DATA_REFRESH_INTERVAL_MS);
	}

	// Load vote stats if in voting mode
	if (displayMode === ProjectorDisplayMode.VotingActive && motionId !== null) {
		void loadVoteStats(motionId);
		voteRefreshInterval = setInterval(() => {
			void loadVoteStats(motionId);
		}, DATA_REFRESH_INTERVAL_MS);
	}

	// Load detailed results if in results mode
	if (displayMode === ProjectorDisplayMode.Results && motionId !== null) {
		void loadDetailedResults(motionId);
		voteRefreshInterval = setInterval(() => {
			void loadDetailedResults(motionId);
		}, DATA_REFRESH_INTERVAL_MS);
	}
}

// Watch for state changes

watch(
	currentState,
	() => {
		setupDataRefresh();
	},
	{ deep: true },
);

// Lifecycle
onMounted(() => {
	setupDataRefresh();
});

onUnmounted(() => {
	clearAllIntervals();
	cleanup();
});
</script>

<template>
	<div class="projector-display" :class="{ blank: isBlank }">
		<!-- Blank Screen -->
		<div v-if="mode === ProjectorDisplayMode.Blank" class="content blank" />

		<!-- Meeting Title -->
		<div
			v-else-if="mode === ProjectorDisplayMode.MeetingTitle"
			class="content meeting-title"
		>
			<div v-if="meeting !== null" class="title-content">
				<h1>{{ meeting.name }}</h1>
				<p v-if="meeting.description" class="description">
					{{ meeting.description }}
				</p>
			</div>
			<div v-else class="loading">Loading meeting...</div>
		</div>

		<!-- Quorum Display -->
		<div
			v-else-if="mode === ProjectorDisplayMode.Quorum"
			class="content quorum"
		>
			<div v-if="meeting !== null && quorum !== null" class="quorum-content">
				<h1>{{ meeting.name }}</h1>
				<div class="quorum-display">
					<div class="quorum-status" :class="{ achieved: quorum.hasQuorum }">
						{{ quorum.hasQuorum ? "Quorum Achieved" : "Quorum Not Reached" }}
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
						{{ quorum.activeVoterPercentage.toFixed(1) }}% participation
					</div>
				</div>
			</div>
			<div v-else class="loading">Loading quorum information...</div>
		</div>

		<!-- Motion Display -->
		<div
			v-else-if="mode === ProjectorDisplayMode.Motion"
			class="content motion"
		>
			<div v-if="motion !== null" class="motion-content">
				<!-- Status indicator row -->
				<div class="motion-status-row">
					<span
						class="motion-status-badge"
						:class="{
							'status-not-started':
								motion.status === MotionStatus.NotYetStarted,
							'status-active': motion.status === MotionStatus.VotingActive,
							'status-complete': motion.status === MotionStatus.VotingComplete,
						}"
					>
						{{
							motion.status === MotionStatus.NotYetStarted
								? "Not Started"
								: motion.status === MotionStatus.VotingActive
									? "Voting Active"
									: "Complete"
						}}
					</span>
					<span
						v-if="motion.status === MotionStatus.VotingActive"
						class="countdown-badge"
						:class="{ urgent: isTimeUrgent, overtime: isOvertime }"
					>
						{{ remainingTimeString }}
					</span>
				</div>
				<h1>{{ motion.name }}</h1>
				<p v-if="motion.description" class="description">
					{{ motion.description }}
				</p>
				<div v-if="choices.length > 0" class="choices">
					<div v-for="choice in choices" :key="choice.id" class="choice">
						{{ choice.name }}
					</div>
				</div>
			</div>
			<div v-else class="loading">Loading motion...</div>
		</div>

		<!-- Voting Active Display -->
		<div
			v-else-if="mode === ProjectorDisplayMode.VotingActive"
			class="content voting-active"
		>
			<div v-if="motion !== null" class="voting-content">
				<h1>Voting in Progress</h1>
				<h2>{{ motion.name }}</h2>
				<div class="voting-status">
					<div class="voting-indicator">
						<span class="pulse" />
						<span>Vote Now</span>
					</div>
				</div>
				<div v-if="voteStats !== null" class="vote-stats">
					<div class="stat">
						<span class="value">{{ voteStats.totalVotes }}</span>
						<span class="label">Votes Cast</span>
					</div>
					<div class="stat">
						<span class="value">{{ voteStats.eligibleVoters }}</span>
						<span class="label">Eligible</span>
					</div>
					<div class="stat">
						<span class="value"
							>{{ voteStats.participationRate.toFixed(1) }}%</span
						>
						<span class="label">Participation</span>
					</div>
				</div>
			</div>
			<div v-else class="loading">Loading voting information...</div>
		</div>

		<!-- Results Display -->
		<div
			v-else-if="mode === ProjectorDisplayMode.Results"
			class="content results"
		>
			<!-- Motion not yet started -->
			<div
				v-if="motion !== null && motion.status === MotionStatus.NotYetStarted"
				class="results-content"
			>
				<h1>Results</h1>
				<h2>{{ motion.name }}</h2>
				<div class="results-message">Motion has not yet been voted upon.</div>
			</div>
			<!-- Motion voting active -->
			<div
				v-else-if="
					motion !== null && motion.status === MotionStatus.VotingActive
				"
				class="results-content"
			>
				<h1>Results</h1>
				<h2>{{ motion.name }}</h2>
				<div class="results-message">
					Motion Active - No results available to report.
				</div>
			</div>
			<!-- Motion voting complete - show results -->
			<div
				v-else-if="motion !== null && detailedResults !== null"
				class="results-content"
			>
				<h1>Results</h1>
				<h2>{{ motion.name }}</h2>
				<div
					v-if="detailedResults.choiceResults.length > 0"
					class="results-display"
				>
					<div
						v-for="(result, index) in detailedResults.choiceResults"
						:key="result.choiceId"
						class="result-row"
						:class="{ winner: index === 0 }"
					>
						<div class="choice-name">{{ result.choiceName }}</div>
						<div class="vote-count">
							{{ result.voteCount }} votes ({{ result.percentage.toFixed(1) }}%)
						</div>
					</div>
				</div>
				<div v-else class="no-votes">No votes recorded</div>
				<div class="results-summary">
					<p>
						{{ detailedResults.totalVotesIncludingAbstentions }} total votes ({{
							detailedResults.participationRate.toFixed(1)
						}}% participation)
					</p>
					<p v-if="detailedResults.abstentionCount > 0">
						{{ detailedResults.abstentionCount }} abstentions ({{
							detailedResults.abstentionPercentage.toFixed(1)
						}}%)
					</p>
				</div>
			</div>
			<div v-else class="loading">Loading results...</div>
		</div>

		<!-- QR Code: User Guide -->
		<div
			v-else-if="mode === ProjectorDisplayMode.QRUserGuide"
			class="content qr-code"
		>
			<div class="qr-content">
				<h1>User Guide</h1>
				<div class="qr-wrapper">
					<QrcodeVue
						:value="userGuideUrl"
						:size="QR_CODE_SIZE"
						level="M"
						background="#ffffff"
						foreground="#000000"
					/>
				</div>
				<p class="qr-url">{{ userGuideUrl }}</p>
				<p class="qr-instruction">Scan to download the user guide</p>
			</div>
		</div>

		<!-- QR Code: Organization -->
		<div
			v-else-if="mode === ProjectorDisplayMode.QROrganization"
			class="content qr-code"
		>
			<div class="qr-content">
				<h1 v-if="currentState.organizationName">
					{{ currentState.organizationName }}
				</h1>
				<h1 v-else>Organization Website</h1>
				<div v-if="currentState.organizationUrl" class="qr-wrapper">
					<QrcodeVue
						:value="currentState.organizationUrl"
						:size="QR_CODE_SIZE"
						level="M"
						background="#ffffff"
						foreground="#000000"
					/>
				</div>
				<div v-else class="qr-placeholder">
					<span class="qr-icon">No URL</span>
				</div>
				<p v-if="currentState.organizationUrl" class="qr-url">
					{{ currentState.organizationUrl }}
				</p>
				<p class="qr-instruction">Scan to visit our website</p>
			</div>
		</div>

		<!-- Custom Message -->
		<div
			v-else-if="mode === ProjectorDisplayMode.CustomMessage"
			class="content custom-message"
			:style="{ backgroundColor: customMessageBackgroundColor }"
		>
			<img
				v-if="currentState.customMessageImageUrl"
				:src="currentState.customMessageImageUrl"
				class="custom-image"
				alt="Custom artwork"
			/>
			<div
				v-if="currentState.customMessage"
				class="message"
				:class="[fontSizeClass, fontFamilyClass]"
				:style="{ color: currentState.customMessageFontColor }"
			>
				{{ currentState.customMessage }}
			</div>
		</div>
	</div>
</template>

<style scoped>
.projector-display {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	background: #1a1a2e;
	color: white;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
}

.projector-display.blank {
	background: #000;
}

.content {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	padding: 4rem;
	max-width: 1600px;
	width: 100%;
}

.content.blank {
	background: transparent;
}

.loading {
	font-size: 2rem;
	color: rgba(255, 255, 255, 0.6);
}

/* Meeting Title */
.meeting-title .title-content h1 {
	font-size: 5rem;
	font-weight: 700;
	margin: 0 0 2rem 0;
	line-height: 1.2;
}

.meeting-title .description {
	font-size: 2.5rem;
	color: rgba(255, 255, 255, 0.8);
	max-width: 1200px;
}

/* Quorum Display */
.quorum .quorum-content h1 {
	font-size: 3rem;
	margin-bottom: 3rem;
	font-weight: 600;
}

.quorum-display {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 3rem;
}

.quorum-status {
	font-size: 3.5rem;
	font-weight: 700;
	padding: 1.5rem 3rem;
	border-radius: 16px;
	background: rgba(244, 67, 54, 0.3);
	border: 3px solid #f44336;
	color: #ff6b6b;
}

.quorum-status.achieved {
	background: rgba(76, 175, 80, 0.3);
	border-color: #4caf50;
	color: #81c784;
}

.quorum-numbers {
	display: flex;
	gap: 6rem;
}

.quorum-numbers .stat {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.quorum-numbers .value {
	font-size: 5rem;
	font-weight: 700;
}

.quorum-numbers .label {
	font-size: 1.5rem;
	color: rgba(255, 255, 255, 0.7);
	text-transform: uppercase;
	letter-spacing: 0.1em;
}

.quorum-percentage {
	font-size: 2rem;
	color: rgba(255, 255, 255, 0.7);
	margin-top: 1rem;
}

/* Motion Display */
.motion .motion-content {
	display: flex;
	flex-direction: column;
	align-items: center;
}

.motion-status-row {
	display: flex;
	align-items: center;
	gap: 1.5rem;
	margin-bottom: 2rem;
}

.motion-status-badge {
	font-size: 1.5rem;
	padding: 0.5rem 1.5rem;
	border-radius: 8px;
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
	font-size: 1.5rem;
	padding: 0.5rem 1.5rem;
	border-radius: 8px;
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

.motion .motion-content h1 {
	font-size: 4rem;
	font-weight: 700;
	margin: 0 0 2rem 0;
}

.motion .description {
	font-size: 2rem;
	color: rgba(255, 255, 255, 0.8);
	margin-bottom: 3rem;
	max-width: 1200px;
}

.motion .choices {
	display: flex;
	flex-wrap: wrap;
	gap: 2rem;
	justify-content: center;
}

.motion .choice {
	font-size: 2rem;
	padding: 1.5rem 3rem;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	border: 2px solid rgba(255, 255, 255, 0.2);
}

/* Voting Active */
.voting-active .voting-content h1 {
	font-size: 3rem;
	color: #4caf50;
	margin-bottom: 1rem;
}

.voting-active .voting-content h2 {
	font-size: 2.5rem;
	font-weight: 600;
	margin-bottom: 2rem;
}

.voting-status {
	margin: 3rem 0;
}

.voting-indicator {
	display: flex;
	align-items: center;
	gap: 1rem;
	font-size: 2.5rem;
	font-weight: 600;
	color: #4caf50;
}

.pulse {
	width: 24px;
	height: 24px;
	background: #4caf50;
	border-radius: 50%;
	animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
	0%,
	100% {
		transform: scale(1);
		opacity: 1;
	}
	50% {
		transform: scale(1.2);
		opacity: 0.7;
	}
}

.vote-progress {
	width: 100%;
	max-width: 800px;
}

.vote-bar {
	display: flex;
	align-items: center;
	gap: 2rem;
	margin-bottom: 1.5rem;
}

.vote-bar .choice-name {
	width: 200px;
	text-align: right;
	font-size: 1.5rem;
}

.vote-bar .bar {
	flex: 1;
	height: 40px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 20px;
	overflow: hidden;
}

.vote-bar .fill {
	height: 100%;
	background: #4caf50;
	border-radius: 20px;
	transition: width 0.5s ease;
}

.vote-bar .count {
	width: 120px;
	font-size: 1.5rem;
	color: rgba(255, 255, 255, 0.8);
}

.vote-stats {
	display: flex;
	gap: 6rem;
	margin-top: 3rem;
}

.vote-stats .stat {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.vote-stats .value {
	font-size: 4rem;
	font-weight: 700;
}

.vote-stats .label {
	font-size: 1.25rem;
	color: rgba(255, 255, 255, 0.7);
	text-transform: uppercase;
	letter-spacing: 0.1em;
}

/* Results Display */
.results .results-content h1 {
	font-size: 3rem;
	margin-bottom: 1rem;
}

.results .results-content h2 {
	font-size: 2rem;
	font-weight: 500;
	margin-bottom: 3rem;
	color: rgba(255, 255, 255, 0.8);
}

.results-message {
	font-size: 2rem;
	color: rgba(255, 255, 255, 0.7);
	font-style: italic;
	padding: 2rem;
	text-align: center;
}

.results-display {
	width: 100%;
	max-width: 800px;
}

.result-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 1.5rem 2rem;
	margin-bottom: 1rem;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	font-size: 2rem;
}

.result-row.winner {
	background: rgba(76, 175, 80, 0.3);
	border: 2px solid #4caf50;
}

.result-row .vote-count {
	font-weight: 600;
}

.no-votes {
	font-size: 2rem;
	color: rgba(255, 255, 255, 0.5);
}

.results-summary {
	margin-top: 2rem;
	padding-top: 2rem;
	border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.results-summary p {
	font-size: 1.25rem;
	color: rgba(255, 255, 255, 0.7);
	margin: 0.5rem 0;
}

/* QR Code Display */
.qr-code .qr-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2rem;
}

.qr-code h1 {
	font-size: 3rem;
	margin: 0;
}

.qr-wrapper {
	padding: 1.5rem;
	background: white;
	border-radius: 16px;
}

.qr-placeholder {
	width: 400px;
	height: 400px;
	background: white;
	border-radius: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.qr-icon {
	font-size: 6rem;
	font-weight: 700;
	color: #333;
}

.qr-url {
	font-size: 1.25rem;
	color: rgba(255, 255, 255, 0.6);
	word-break: break-all;
	max-width: 600px;
}

.qr-instruction {
	font-size: 1.5rem;
	color: rgba(255, 255, 255, 0.8);
}

/* Custom Message */
.custom-message {
	padding: 4rem;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	width: 100vw;
	height: 100vh;
	position: fixed;
	top: 0;
	left: 0;
}

.custom-message .message {
	white-space: pre-wrap;
	word-break: break-word;
	max-width: 1400px;
	text-align: center;
}

.custom-message .font-small {
	font-size: 2.5rem;
}

.custom-message .font-medium {
	font-size: 4rem;
}

.custom-message .font-large {
	font-size: 6rem;
}

/* Font families for custom message */
.custom-message .font-family-sans-serif {
	font-family:
		system-ui,
		-apple-system,
		sans-serif;
}

.custom-message .font-family-serif {
	font-family: Georgia, "Times New Roman", serif;
}

.custom-message .font-family-monospace {
	font-family: "Courier New", Consolas, monospace;
}

.custom-message .font-family-cursive {
	font-family: "Brush Script MT", cursive;
}

.custom-message .font-family-display {
	font-family: Impact, "Arial Black", sans-serif;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

/* Custom image in message */
.custom-image {
	max-width: 60%;
	max-height: 50%;
	object-fit: contain;
	border-radius: 16px;
	margin-bottom: 2rem;
}
</style>
