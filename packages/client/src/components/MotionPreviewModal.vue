<script setup lang="ts">
import { computed } from "vue";

interface Props {
	motionName: string;
	description: string | null;
	selectionCount: number;
	meetingName: string;
	votingPoolName: string;
	choices: Array<{
		id?: number;
		name: string;
		sortOrder?: number;
	}>;
}

const props = defineProps<Props>();

defineEmits<{
	close: [];
}>();

const DEFAULT_SORT_ORDER = 0;

const sortedChoices = computed(() =>
	[...props.choices].sort((a, b) => {
		const orderA = a.sortOrder ?? DEFAULT_SORT_ORDER;
		const orderB = b.sortOrder ?? DEFAULT_SORT_ORDER;
		return orderA - orderB;
	}),
);
</script>

<template>
	<div class="modal-overlay" @click="$emit('close')">
		<div class="modal-container" @click.stop>
			<!-- Phone frame with device chrome -->
			<div class="phone-frame">
				<!-- Device bezel (top notch area) -->
				<div class="device-bezel">
					<div class="notch"></div>
				</div>

				<!-- Preview disclaimer banner (sticky) -->
				<div class="preview-banner">
					⚠️ Preview Mode - No voting will be recorded
				</div>

				<!-- Scrollable content (replicates voter view) -->
				<div class="phone-content">
					<div class="motion-preview">
						<div class="motion-header">
							<h2>{{ motionName }}</h2>
						</div>

						<div v-if="description" class="motion-description">
							<p>{{ description }}</p>
						</div>

						<div class="motion-info">
							<div class="info-item">
								<span class="info-label">Meeting</span>
								<span class="info-value">{{ meetingName }}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Selections</span>
								<span class="info-value">{{ selectionCount }}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Voting Pool</span>
								<span class="info-value">{{ votingPoolName }}</span>
							</div>
						</div>

						<div class="voting-section">
							<h3>Cast Your Vote</h3>
							<p class="vote-instructions">
								Select up to {{ selectionCount }} choice(s), or choose to
								abstain.
							</p>

							<!-- Choices list -->
							<div class="choices-list">
								<div
									v-for="choice in sortedChoices"
									:key="choice.id ?? choice.name"
									class="choice-item disabled"
								>
									<span class="choice-checkbox"></span>
									<span class="choice-name">{{ choice.name }}</span>
								</div>
							</div>

							<!-- Abstain option -->
							<div class="abstain-section">
								<div class="choice-item abstain-item disabled">
									<span class="choice-checkbox"></span>
									<span class="choice-name">Abstain</span>
								</div>
								<p class="abstain-note">
									Selecting Abstain will be treated the same as if you did not
									vote on the motion, and will only impact the participation
									records and statistics.
								</p>
							</div>

							<!-- Submit button -->
							<div class="submit-section">
								<button
									type="button"
									class="btn btn-primary btn-large"
									disabled
								>
									Submit Vote (Preview Only)
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Close button (outside phone frame) -->
			<button type="button" class="close-button" @click="$emit('close')">
				Close Preview
			</button>
		</div>
	</div>
</template>

<style scoped>
/* Modal overlay - full screen, dark background */
.modal-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background-color: rgba(0, 0, 0, 0.7);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
	padding: 1rem;
}

/* Modal container */
.modal-container {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	max-height: 90vh;
}

/* Phone frame - 375px width (standard iPhone width) */
.phone-frame {
	width: 375px;
	max-width: 100vw;
	max-height: 667px;
	background-color: #1a1a1a;
	border-radius: 36px;
	padding: 12px;
	box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

/* Device bezel (top notch area) */
.device-bezel {
	background-color: #1a1a1a;
	height: 30px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 20px 20px 0 0;
}

/* Notch */
.notch {
	width: 150px;
	height: 20px;
	background-color: #000;
	border-radius: 0 0 12px 12px;
}

/* Preview disclaimer banner */
.preview-banner {
	background-color: #fff3cd;
	color: #856404;
	padding: 0.75rem;
	text-align: center;
	font-weight: 600;
	font-size: 0.875rem;
	border-bottom: 2px solid #ffc107;
	position: sticky;
	top: 0;
	z-index: 10;
}

/* Scrollable phone content */
.phone-content {
	flex: 1;
	overflow-y: auto;
	background-color: #f5f5f5;
	-webkit-overflow-scrolling: touch;
}

/* Motion preview content (replicates voter view) */
.motion-preview {
	padding: 1.5rem 1rem;
}

.motion-header {
	margin-bottom: 1.5rem;
}

.motion-header h2 {
	margin: 0;
	color: #2c3e50;
	font-size: 2rem;
	word-wrap: break-word;
}

.motion-description {
	color: #666;
	margin-bottom: 1.5rem;
	padding-bottom: 1.5rem;
	border-bottom: 1px solid #eee;
}

.motion-description p {
	margin: 0;
	line-height: 1.6;
	white-space: pre-wrap;
}

.motion-info {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
	gap: 0.5rem;
	margin-bottom: 2rem;
}

.info-item {
	background: #f8f9fa;
	padding: 0.75rem;
	border-radius: 4px;
}

.info-label {
	display: block;
	font-size: 0.7rem;
	color: #888;
	text-transform: uppercase;
	margin-bottom: 0.25rem;
}

.info-value {
	display: block;
	font-size: 0.875rem;
	color: #2c3e50;
	font-weight: 500;
	word-wrap: break-word;
}

.voting-section {
	border-top: 1px solid #eee;
	padding-top: 1.5rem;
}

.voting-section h3 {
	margin: 0 0 0.5rem 0;
	color: #2c3e50;
	font-size: 1.125rem;
}

.vote-instructions {
	color: #666;
	margin-bottom: 1.5rem;
	font-size: 0.875rem;
}

.choices-list {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin-bottom: 1rem;
}

.choice-item {
	display: flex;
	align-items: center;
	padding: 0.875rem;
	background: #f8f9fa;
	border: 2px solid #dee2e6;
	border-radius: 8px;
	cursor: not-allowed;
	transition: all 0.2s;
}

.choice-item.disabled {
	opacity: 0.8;
}

.choice-checkbox {
	width: 22px;
	height: 22px;
	border: 2px solid #adb5bd;
	border-radius: 4px;
	margin-right: 0.875rem;
	display: flex;
	align-items: center;
	justify-content: center;
	background: white;
	flex-shrink: 0;
}

.choice-name {
	font-size: 0.9375rem;
	color: #2c3e50;
	word-wrap: break-word;
	flex: 1;
}

.abstain-section {
	margin-top: 1rem;
	padding-top: 1rem;
	border-top: 1px dashed #dee2e6;
}

.abstain-item {
	background: #fff3e0;
	border-color: #ff9800;
}

.abstain-note {
	margin: 0.5rem 0 0 0;
	font-size: 0.75rem;
	color: #666;
	font-style: italic;
}

.submit-section {
	margin-top: 1.5rem;
	text-align: center;
}

.btn {
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-weight: 500;
}

.btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.btn-primary {
	background-color: #bdbdbd;
	color: white;
}

.btn-large {
	padding: 0.75rem 2rem;
	font-size: 1rem;
	width: 100%;
}

/* Close button (outside phone frame) */
.close-button {
	padding: 0.75rem 2rem;
	background-color: #2c3e50;
	color: white;
	border: none;
	border-radius: 8px;
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
	align-self: center;
	transition: background-color 0.2s;
}

.close-button:hover {
	background-color: #1a252f;
}

/* Scrollbar styling for phone content */
.phone-content::-webkit-scrollbar {
	width: 6px;
}

.phone-content::-webkit-scrollbar-track {
	background: #e0e0e0;
}

.phone-content::-webkit-scrollbar-thumb {
	background: #9e9e9e;
	border-radius: 3px;
}

/* Responsive adjustments for very small screens */
@media (max-width: 400px) {
	.phone-frame {
		width: 100%;
		border-radius: 24px;
		padding: 8px;
	}

	.device-bezel {
		height: 24px;
	}

	.notch {
		width: 120px;
		height: 16px;
	}
}
</style>
