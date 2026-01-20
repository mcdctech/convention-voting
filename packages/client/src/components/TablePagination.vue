<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
	currentPage: number;
	totalPages: number;
	totalItems: number;
}>();

const emit = defineEmits<{
	pageChange: [page: number];
}>();

const MIN_PAGE = 1;
const PAGE_STEP = 1;

const canGoPrevious = computed(() => props.currentPage > MIN_PAGE);
const canGoNext = computed(() => props.currentPage < props.totalPages);

function goToPrevious(): void {
	if (canGoPrevious.value) {
		emit("pageChange", props.currentPage - PAGE_STEP);
	}
}

function goToNext(): void {
	if (canGoNext.value) {
		emit("pageChange", props.currentPage + PAGE_STEP);
	}
}
</script>

<template>
	<div class="table-pagination">
		<button
			class="pagination-btn"
			:disabled="!canGoPrevious"
			@click="goToPrevious"
		>
			Previous
		</button>
		<span class="page-info">
			Page {{ currentPage }} of {{ totalPages }} ({{ totalItems }} total)
		</span>
		<button class="pagination-btn" :disabled="!canGoNext" @click="goToNext">
			Next
		</button>
	</div>
</template>

<style scoped>
.table-pagination {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 1rem;
	border-top: 1px solid #dee2e6;
	background-color: #f8f9fa;
}

.pagination-btn {
	padding: 0.5rem 1rem;
	border: 1px solid #dee2e6;
	border-radius: 4px;
	background-color: white;
	color: #2c3e50;
	font-size: 0.875rem;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s;
}

.pagination-btn:hover:not(:disabled) {
	background-color: #e9ecef;
	border-color: #adb5bd;
}

.pagination-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
	background-color: #f8f9fa;
}

.page-info {
	color: #495057;
	font-size: 0.875rem;
}
</style>
