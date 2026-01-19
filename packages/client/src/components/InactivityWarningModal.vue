<script setup lang="ts">
/**
 * Inactivity warning modal component
 * Shows a countdown warning when user is inactive in kiosk mode
 */

defineProps<{
	secondsLeft: number;
}>();

const emit = defineEmits<{
	confirm: [];
}>();

function handleConfirm(): void {
	emit("confirm");
}
</script>

<template>
	<div class="modal-overlay">
		<div class="modal">
			<div class="warning-icon">!</div>
			<h3>Are you still there?</h3>
			<p class="countdown-text">
				Logging out in <strong>{{ secondsLeft }}</strong> seconds...
			</p>
			<button class="btn btn-primary btn-large" @click="handleConfirm">
				Yes, I'm still here
			</button>
		</div>
	</div>
</template>

<style scoped>
.modal-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.7);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 2000;
}

.modal {
	background: white;
	border-radius: 12px;
	padding: 2.5rem;
	max-width: 400px;
	width: 90%;
	text-align: center;
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.warning-icon {
	width: 60px;
	height: 60px;
	background: #ff9800;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	margin: 0 auto 1.5rem;
	color: white;
	font-size: 32px;
	font-weight: bold;
}

.modal h3 {
	margin: 0 0 1rem 0;
	color: #2c3e50;
	font-size: 1.5rem;
}

.countdown-text {
	margin: 0 0 2rem 0;
	color: #666;
	font-size: 1.1rem;
}

.countdown-text strong {
	color: #dc3545;
	font-size: 1.25rem;
}

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.9rem;
	font-weight: 500;
}

.btn-primary {
	background-color: #007bff;
	color: white;
}

.btn-primary:hover {
	background-color: #0056b3;
}

.btn-large {
	padding: 1rem 2rem;
	font-size: 1.1rem;
}
</style>
