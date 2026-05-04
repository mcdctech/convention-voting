<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import {
	getUsers,
	getPools,
	getMeetings,
	disableUser,
	enableUser,
	resetUserPassword,
} from "../../services/api";
import TablePagination from "../../components/TablePagination.vue";
import { useAuth } from "../../composables/useAuth";
import { useAdminMeeting } from "../../composables/useAdminMeeting";
import type {
	User,
	Pool,
	MeetingWithPool,
} from "@mcdc-convention-voting/shared";

const router = useRouter();
const { currentUser } = useAuth();
const { isJoined, joinedMeetingId, currentMeeting } = useAdminMeeting();

// Constants
const USERS_PER_PAGE = 50;
const INITIAL_PAGE = 1;
const INITIAL_TOTAL = 0;
const MAX_POOLS = 1000;
const MAX_MEETINGS = 1000;

const users = ref<User[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(INITIAL_PAGE);
const totalUsers = ref(INITIAL_TOTAL);
const searchQuery = ref("");

// Pool filter state
// Special values:
// - "view-no-users" = show no users (default)
// - "all" = show all users
// - "no-pool" = show users not assigned to any pool
// - number = filter by specific pool ID
const POOL_FILTER_VIEW_NO_USERS = "view-no-users";
const POOL_FILTER_ALL = "all";
const POOL_FILTER_NO_POOL = "no-pool";
const pools = ref<Pool[]>([]);
const meetings = ref<MeetingWithPool[]>([]);
const loadingPools = ref(false);
const loadingMeetings = ref(false);
const selectedPoolFilter = ref<string>(POOL_FILTER_VIEW_NO_USERS);
const showOnlyQuorumPools = ref(false);

// User filtering state
const suppressDisabledUsers = ref(true); // Checked by default
type UserRoleFilter = "all" | "admin" | "meeting_admin" | "watcher" | "voter";
const selectedRoleFilter = ref<UserRoleFilter>("all");
const showAllUsers = ref(false); // Override for meeting focus filter

const generatedPassword = ref<{
	username: string;
	password: string;
} | null>(null);

// Scroll shadow indicator state
const scrollWrapper = ref<HTMLElement | null>(null);
const canScrollRight = ref(false);

const showDisableModal = ref(false);
const userToDisable = ref<string | null>(null);
const showResetPasswordModal = ref(false);
const userToResetPassword = ref<string | null>(null);

const totalPages = computed(() => Math.ceil(totalUsers.value / USERS_PER_PAGE));

// Whether users should be displayed (not "view-no-users")
const shouldShowUsers = computed(
	() => selectedPoolFilter.value !== POOL_FILTER_VIEW_NO_USERS,
);

// Get set of quorum pool IDs from meetings
const quorumPoolIds = computed(
	(): Set<number> => new Set(meetings.value.map((m) => m.quorumVotingPoolId)),
);

// Filter pools: exclude disabled, optionally filter to quorum-only, sort alphabetically
const filteredPools = computed((): Pool[] => {
	let filtered = pools.value.filter((pool) => !pool.isDisabled);

	if (showOnlyQuorumPools.value) {
		filtered = filtered.filter((pool) => quorumPoolIds.value.has(pool.id));
	}

	// Sort alphabetically by pool name
	return filtered.sort((a, b) =>
		a.poolName.toLowerCase().localeCompare(b.poolName.toLowerCase()),
	);
});

// Computed property for meeting focus filter
const meetingFilterId = computed(() => {
	// Apply meeting filter if joined and not overriding with "show all"
	if (isJoined.value && !showAllUsers.value) {
		return joinedMeetingId.value ?? undefined;
	}
	return undefined;
});

// Computed property for focused meeting's quorum pool ID
const focusedQuorumPoolId = computed(() => {
	if (isJoined.value && currentMeeting.value !== null) {
		return currentMeeting.value.meeting.quorumVotingPoolId;
	}
	return undefined;
});

async function loadPools(): Promise<void> {
	loadingPools.value = true;
	try {
		const response = await getPools({ page: INITIAL_PAGE, limit: MAX_POOLS });
		pools.value = response.data;
	} catch {
		// Silently fail - dropdown will be empty
	} finally {
		loadingPools.value = false;
	}
}

async function loadMeetings(): Promise<void> {
	loadingMeetings.value = true;
	try {
		const response = await getMeetings(INITIAL_PAGE, MAX_MEETINGS);
		meetings.value = response.data;
	} catch {
		// Silently fail - quorum filter won't work but pools will still show
	} finally {
		loadingMeetings.value = false;
	}
}

async function loadUsers(): Promise<void> {
	// Don't load users if "view-no-users" is selected
	if (selectedPoolFilter.value === POOL_FILTER_VIEW_NO_USERS) {
		users.value = [];
		totalUsers.value = INITIAL_TOTAL;
		return;
	}

	loading.value = true;
	error.value = null;

	try {
		const search = searchQuery.value.trim();
		const searchParam = search === "" ? undefined : search;

		// Determine filter parameters based on selection
		let poolId: number | undefined = undefined;
		let noPool: boolean | undefined = undefined;

		// When focused on a meeting and "show only quorum pools" is checked,
		// filter to the focused meeting's quorum pool
		if (showOnlyQuorumPools.value && focusedQuorumPoolId.value !== undefined) {
			poolId = focusedQuorumPoolId.value;
			noPool = undefined;
		} else if (selectedPoolFilter.value === POOL_FILTER_ALL) {
			// Show all users - no filters
			poolId = undefined;
			noPool = undefined;
		} else if (selectedPoolFilter.value === POOL_FILTER_NO_POOL) {
			// Show users not assigned to any pool
			poolId = undefined;
			noPool = true;
		} else {
			// Filter by specific pool ID
			poolId = parseInt(selectedPoolFilter.value, 10);
			noPool = undefined;
		}

		const response = await getUsers({
			page: currentPage.value,
			limit: USERS_PER_PAGE,
			search: searchParam,
			poolId,
			noPool,
			includeDisabled: !suppressDisabledUsers.value,
			role: selectedRoleFilter.value,
			forMeetingId: meetingFilterId.value,
		});
		const { data, pagination } = response;
		users.value = data;
		totalUsers.value = pagination.total;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to load users";
	} finally {
		loading.value = false;
	}
}

function handleSearch(): void {
	currentPage.value = INITIAL_PAGE;
	void loadUsers();
}

function handlePoolChange(): void {
	searchQuery.value = "";
	currentPage.value = INITIAL_PAGE;
	void loadUsers();
}

function clearSearch(): void {
	searchQuery.value = "";
	currentPage.value = INITIAL_PAGE;
	void loadUsers();
}

function requestDisable(userId: string): void {
	userToDisable.value = userId;
	showDisableModal.value = true;
}

function cancelDisable(): void {
	showDisableModal.value = false;
	userToDisable.value = null;
}

async function handleDisable(): Promise<void> {
	if (userToDisable.value === null) {
		return;
	}

	showDisableModal.value = false;
	const { value: userId } = userToDisable;
	userToDisable.value = null;

	try {
		await disableUser(userId);
		await loadUsers();
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to disable user";
	}
}

async function handleEnable(userId: string): Promise<void> {
	try {
		await enableUser(userId);
		await loadUsers();
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Failed to enable user";
	}
}

function requestResetPassword(userId: string): void {
	userToResetPassword.value = userId;
	showResetPasswordModal.value = true;
}

function cancelResetPassword(): void {
	showResetPasswordModal.value = false;
	userToResetPassword.value = null;
}

async function handleResetPassword(): Promise<void> {
	if (userToResetPassword.value === null) {
		return;
	}

	showResetPasswordModal.value = false;
	const { value: userId } = userToResetPassword;
	userToResetPassword.value = null;

	try {
		const response = await resetUserPassword(userId);
		if (response.data !== undefined) {
			const { data } = response;
			const { username, password } = data;
			generatedPassword.value = {
				username,
				password,
			};
			await loadUsers();
		}
	} catch (err) {
		error.value =
			err instanceof Error ? err.message : "Failed to reset password";
	}
}

function goToPage(page: number): void {
	currentPage.value = page;
	void loadUsers();
}

function editUser(userId: string): void {
	void router.push(`/admin/users/${userId}/edit`);
}

function closePasswordModal(): void {
	generatedPassword.value = null;
}

// Check if there's horizontal scroll content to the right
function updateScrollShadow(): void {
	const wrapper = scrollWrapper.value;
	if (wrapper === null) {
		canScrollRight.value = false;
		return;
	}
	// Show shadow if there's more content to scroll right
	const scrollThreshold = 1;
	canScrollRight.value =
		wrapper.scrollWidth - wrapper.scrollLeft - wrapper.clientWidth >
		scrollThreshold;
}

// Handle scroll events on the wrapper
function handleScrollEvent(): void {
	updateScrollShadow();
}

// Handle quorum pools checkbox change
function handleQuorumPoolsChange(): void {
	// Reset pool filter to default when toggling quorum filter
	// This ensures we don't have a non-quorum pool selected when switching to quorum-only mode
	if (
		showOnlyQuorumPools.value &&
		selectedPoolFilter.value !== POOL_FILTER_VIEW_NO_USERS &&
		selectedPoolFilter.value !== POOL_FILTER_ALL &&
		selectedPoolFilter.value !== POOL_FILTER_NO_POOL
	) {
		// Check if current selection is still valid
		const currentPoolId = parseInt(selectedPoolFilter.value, 10);
		if (!quorumPoolIds.value.has(currentPoolId)) {
			selectedPoolFilter.value = POOL_FILTER_VIEW_NO_USERS;
		}
	}
}

// Handle suppress disabled users checkbox change
function handleSuppressDisabledChange(): void {
	if (shouldShowUsers.value) {
		currentPage.value = INITIAL_PAGE;
		void loadUsers();
	}
}

// Handle role filter change
function handleRoleFilterChange(): void {
	if (shouldShowUsers.value) {
		currentPage.value = INITIAL_PAGE;
		void loadUsers();
	}
}

onMounted(() => {
	void loadPools();
	void loadMeetings();
	// Don't load users on mount - wait for pool selection

	// Check scroll shadow after DOM is ready
	void nextTick(() => {
		updateScrollShadow();
	});
});

onUnmounted(() => {
	// Cleanup scroll listener if wrapper exists
	if (scrollWrapper.value !== null) {
		scrollWrapper.value.removeEventListener("scroll", handleScrollEvent);
	}
});

// Update scroll shadow when users change (table size may change)
watch(users, () => {
	void nextTick(() => {
		updateScrollShadow();
	});
});

// Reload users when meeting focus changes
watch(meetingFilterId, () => {
	if (shouldShowUsers.value) {
		currentPage.value = INITIAL_PAGE;
		void loadUsers();
	}
});

// Reload users when quorum pool filter changes (when focused on a meeting)
watch(showOnlyQuorumPools, () => {
	if (shouldShowUsers.value && isJoined.value) {
		currentPage.value = INITIAL_PAGE;
		void loadUsers();
	}
});

// Also update on window resize
onMounted(() => {
	window.addEventListener("resize", updateScrollShadow);
});

onUnmounted(() => {
	window.removeEventListener("resize", updateScrollShadow);
});
</script>

<template>
	<div class="user-list">
		<div class="header">
			<h2>Users</h2>
			<div class="header-actions">
				<router-link to="/admin/users/create" class="btn btn-primary">
					Create User
				</router-link>
				<router-link to="/admin/users/upload" class="btn btn-secondary">
					Upload CSV
				</router-link>
			</div>
		</div>

		<!-- Meeting focus indicator -->
		<div v-if="isJoined && currentMeeting" class="focus-indicator">
			<span class="focus-label">
				Showing users for:
				<strong>{{ currentMeeting.meeting.name }}</strong>
			</span>
			<label class="checkbox-label override-toggle">
				<input v-model="showAllUsers" type="checkbox" />
				Show all users
			</label>
		</div>

		<div v-if="loading" class="loading">Loading users...</div>

		<div v-if="error" class="error">
			{{ error }}
		</div>

		<div v-if="!loading && !error" class="table-container">
			<div class="table-header">
				<div class="filter-row">
					<div class="pool-filter-group">
						<div class="pool-filter">
							<label for="pool-select">Filter by Pool:</label>
							<select
								id="pool-select"
								v-model="selectedPoolFilter"
								:disabled="loading || loadingPools"
								@change="handlePoolChange"
							>
								<option :value="POOL_FILTER_VIEW_NO_USERS">
									View No Users
								</option>
								<option :value="POOL_FILTER_ALL">All</option>
								<option :value="POOL_FILTER_NO_POOL">None (No Pool)</option>
								<option
									v-for="pool in filteredPools"
									:key="pool.id"
									:value="String(pool.id)"
								>
									{{ pool.poolName }}
								</option>
							</select>
						</div>
						<div class="quorum-filter">
							<label class="checkbox-label">
								<input
									v-model="showOnlyQuorumPools"
									type="checkbox"
									:disabled="loadingMeetings"
									@change="handleQuorumPoolsChange"
								/>
								Show only quorum pools in dropdown
							</label>
						</div>
						<div class="disabled-filter">
							<label class="checkbox-label">
								<input
									v-model="suppressDisabledUsers"
									type="checkbox"
									@change="handleSuppressDisabledChange"
								/>
								Suppress Disabled Users
							</label>
						</div>
					</div>
					<div class="role-filter-group">
						<div class="role-filter">
							<label for="role-select">User Type:</label>
							<select
								id="role-select"
								v-model="selectedRoleFilter"
								:disabled="loading"
								@change="handleRoleFilterChange"
							>
								<option value="all">All</option>
								<option value="admin">Global Admin</option>
								<option value="meeting_admin">Meeting Admin</option>
								<option value="watcher">Watcher</option>
								<option value="voter">Voter</option>
							</select>
						</div>
					</div>
					<div class="search-box">
						<input
							v-model="searchQuery"
							type="text"
							placeholder="Search by name, username, or voter ID..."
							class="search-input"
							:disabled="!shouldShowUsers"
							@keyup.enter="handleSearch"
						/>
						<button
							class="btn btn-small"
							:disabled="!shouldShowUsers"
							@click="handleSearch"
						>
							Search
						</button>
						<button
							v-if="searchQuery"
							class="btn btn-small btn-secondary"
							@click="clearSearch"
						>
							Clear
						</button>
						<span v-if="shouldShowUsers" class="search-hint">
							Searches within selected filter
						</span>
					</div>
				</div>
			</div>

			<div v-if="!shouldShowUsers" class="select-pool-message">
				Select a filter option to view users.
			</div>

			<div
				v-if="shouldShowUsers"
				class="table-scroll-container"
				:class="{ 'has-scroll-right': canScrollRight }"
			>
				<div
					ref="scrollWrapper"
					class="table-scroll-wrapper"
					@scroll="handleScrollEvent"
				>
					<table class="users-table">
						<thead>
							<tr>
								<th>Username</th>
								<th>Name</th>
								<th>Voter ID</th>
								<th>Pools</th>
								<th>Status</th>
								<th>Role</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="user in users" :key="user.id">
								<td>{{ user.username }}</td>
								<td>{{ user.firstName }} {{ user.lastName }}</td>
								<td>{{ user.voterId ?? "N/A" }}</td>
								<td class="pools-cell">
									{{
										user.poolNames && user.poolNames.length > 0
											? user.poolNames.join(", ")
											: "—"
									}}
								</td>
								<td>
									<span
										:class="
											user.isDisabled ? 'status-disabled' : 'status-active'
										"
									>
										{{ user.isDisabled ? "Disabled" : "Active" }}
									</span>
								</td>
								<td>
									<span
										:class="{
											'role-admin': user.isAdmin,
											'role-meeting-admin': user.isMeetingAdmin,
											'role-watcher': user.isWatcher,
											'role-voter':
												!user.isAdmin &&
												!user.isMeetingAdmin &&
												!user.isWatcher,
										}"
									>
										{{
											user.isAdmin
												? "Admin"
												: user.isMeetingAdmin
													? "Meeting Admin"
													: user.isWatcher
														? "Watcher"
														: "Voter"
										}}
									</span>
								</td>
								<td class="actions">
									<button class="btn btn-small" @click="editUser(user.id)">
										Edit
									</button>
									<button
										v-if="!user.isDisabled && user.id !== currentUser?.id"
										class="btn btn-small btn-warning"
										@click="requestDisable(user.id)"
									>
										Disable
									</button>
									<button
										v-if="user.isDisabled && user.id !== currentUser?.id"
										class="btn btn-small btn-success"
										@click="handleEnable(user.id)"
									>
										Enable
									</button>
									<button
										v-if="user.id !== currentUser?.id"
										class="btn btn-small btn-secondary"
										@click="requestResetPassword(user.id)"
									>
										Reset Password
									</button>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<TablePagination
				v-if="shouldShowUsers"
				:current-page="currentPage"
				:total-pages="totalPages"
				:total-items="totalUsers"
				@page-change="goToPage"
			/>
		</div>

		<div v-if="showDisableModal" class="modal" @click="cancelDisable">
			<div class="modal-content" @click.stop>
				<h3>Confirm Disable User</h3>
				<p>
					Are you sure you want to disable this user? They will not be able to
					log in.
				</p>
				<div class="modal-actions">
					<button class="btn btn-warning" @click="handleDisable">
						Yes, Disable User
					</button>
					<button class="btn btn-secondary" @click="cancelDisable">
						Cancel
					</button>
				</div>
			</div>
		</div>

		<div
			v-if="showResetPasswordModal"
			class="modal"
			@click="cancelResetPassword"
		>
			<div class="modal-content" @click.stop>
				<h3>Confirm Password Reset</h3>
				<p>
					Are you sure you want to reset this user's password? A new password
					will be generated.
				</p>
				<div class="modal-actions">
					<button class="btn btn-primary" @click="handleResetPassword">
						Yes, Reset Password
					</button>
					<button class="btn btn-secondary" @click="cancelResetPassword">
						Cancel
					</button>
				</div>
			</div>
		</div>

		<div v-if="generatedPassword" class="modal" @click="closePasswordModal">
			<div class="modal-content" @click.stop>
				<h3>Password Generated</h3>
				<p>
					<strong>IMPORTANT:</strong> Save this password now. It will not be
					shown again.
				</p>
				<div class="password-display">
					<p><strong>Username:</strong> {{ generatedPassword.username }}</p>
					<p><strong>Password:</strong> {{ generatedPassword.password }}</p>
				</div>
				<button class="btn" @click="closePasswordModal">Close</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.user-list {
	max-width: 1400px;
	margin: 0 auto;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 2rem;
}

.header h2 {
	margin: 0;
	color: #2c3e50;
}

.header-actions {
	display: flex;
	gap: 1rem;
}

.focus-indicator {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 1rem;
	margin-bottom: 1rem;
	padding: 0.75rem 1rem;
	background-color: #e3f2fd;
	border: 1px solid #90caf9;
	border-radius: 8px;
	color: #1565c0;
}

.focus-label {
	font-size: 0.9375rem;
}

.focus-label strong {
	color: #0d47a1;
}

.override-toggle {
	color: #1565c0;
}

.loading,
.error {
	padding: 1rem;
	margin: 1rem 0;
	border-radius: 4px;
}

.loading {
	background-color: #e3f2fd;
	color: #1976d2;
}

.error {
	background-color: #ffebee;
	color: #c62828;
}

.table-container {
	background: white;
	border-radius: 8px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	overflow: hidden;
}

/* Container for shadow indicator - doesn't scroll */
.table-scroll-container {
	position: relative;
	overflow: hidden;
}

/* Dynamic shadow indicator when there's content to scroll right */
.table-scroll-container.has-scroll-right::after {
	content: "";
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	width: 30px;
	background: linear-gradient(to left, rgba(0, 0, 0, 0.1) 0%, transparent 100%);
	pointer-events: none;
	z-index: 2;
}

/* Inner wrapper that handles both horizontal and vertical scrolling */
.table-scroll-wrapper {
	overflow-x: auto;
	overflow-y: auto;
	max-height: 70vh;
	-webkit-overflow-scrolling: touch;
}

.table-header {
	padding: 1rem;
	border-bottom: 1px solid #dee2e6;
}

.filter-row {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.pool-filter-group {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.pool-filter {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.pool-filter label {
	font-weight: 500;
	color: #2c3e50;
}

.pool-filter select {
	padding: 0.5rem 0.75rem;
	border: 1px solid #dee2e6;
	border-radius: 4px;
	font-size: 0.875rem;
	min-width: 200px;
	background-color: white;
}

.pool-filter select:focus {
	outline: none;
	border-color: #1976d2;
	box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
}

.pool-filter select:disabled {
	background-color: #f5f5f5;
	cursor: not-allowed;
}

.quorum-filter,
.disabled-filter {
	display: flex;
	align-items: center;
}

.role-filter-group {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.role-filter {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.role-filter label {
	font-weight: 500;
	color: #2c3e50;
}

.role-filter select {
	padding: 0.5rem 0.75rem;
	border: 1px solid #dee2e6;
	border-radius: 4px;
	font-size: 0.875rem;
	min-width: 150px;
	background-color: white;
}

.role-filter select:focus {
	outline: none;
	border-color: #1976d2;
	box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
}

.role-filter select:disabled {
	background-color: #f5f5f5;
	cursor: not-allowed;
}

.checkbox-label {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	cursor: pointer;
	font-size: 0.875rem;
	color: #2c3e50;
}

.checkbox-label input[type="checkbox"] {
	width: 1rem;
	height: 1rem;
	cursor: pointer;
}

.checkbox-label input[type="checkbox"]:disabled {
	cursor: not-allowed;
}

.select-pool-message {
	padding: 2rem;
	text-align: center;
	color: #666;
	font-style: italic;
}

.search-box {
	display: flex;
	gap: 0.5rem;
	align-items: center;
	flex-wrap: wrap;
}

.search-hint {
	font-size: 0.8rem;
	color: #666;
	font-style: italic;
}

.search-input {
	padding: 0.5rem 0.75rem;
	border: 1px solid #dee2e6;
	border-radius: 4px;
	font-size: 0.875rem;
	width: 280px;
}

.search-input:focus {
	outline: none;
	border-color: #1976d2;
	box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
}

.users-table {
	width: 100%;
	min-width: 900px;
	border-collapse: collapse;
}

.users-table th,
.users-table td {
	padding: 1rem;
	text-align: left;
	border-bottom: 1px solid #dee2e6;
}

.users-table th {
	background-color: #f8f9fa;
	font-weight: 600;
	color: #2c3e50;
	position: sticky;
	top: 0;
	z-index: 1;
}

.users-table tbody tr:hover {
	background-color: #fafafa;
}

.status-active {
	color: #2e7d32;
	font-weight: 500;
}

.status-disabled {
	color: #c62828;
	font-weight: 500;
}

.role-admin {
	display: inline-block;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-size: 0.75rem;
	font-weight: 600;
	background-color: #e3f2fd;
	color: #1565c0;
}

.role-meeting-admin {
	display: inline-block;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-size: 0.75rem;
	font-weight: 600;
	background-color: #fff3e0;
	color: #e65100;
}

.role-watcher {
	display: inline-block;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-size: 0.75rem;
	font-weight: 600;
	background-color: #f3e5f5;
	color: #7b1fa2;
}

.role-voter {
	display: inline-block;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-size: 0.75rem;
	font-weight: 600;
	background-color: #e8f5e9;
	color: #2e7d32;
}

.actions {
	display: flex;
	gap: 0.5rem;
	white-space: nowrap;
}

.btn {
	padding: 0.5rem 1rem;
	border: none;
	border-radius: 4px;
	background-color: #34495e;
	color: white;
	cursor: pointer;
	font-size: 0.875rem;
	font-weight: 500;
	text-decoration: none;
	display: inline-block;
	transition: all 0.2s;
}

.btn:hover:not(:disabled) {
	background-color: #2c3e50;
}

.btn-primary {
	background-color: #1976d2;
}

.btn-primary:hover:not(:disabled) {
	background-color: #1565c0;
}

.btn:disabled {
	background-color: #bdbdbd;
	cursor: not-allowed;
}

.btn-small {
	padding: 0.375rem 0.75rem;
	font-size: 0.8125rem;
}

.btn-warning {
	background-color: #f57c00;
}

.btn-warning:hover:not(:disabled) {
	background-color: #ef6c00;
}

.btn-success {
	background-color: #388e3c;
}

.btn-success:hover:not(:disabled) {
	background-color: #2e7d32;
}

.btn-secondary {
	background-color: #757575;
}

.btn-secondary:hover:not(:disabled) {
	background-color: #616161;
}

.modal {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(0, 0, 0, 0.5);
	display: flex;
	justify-content: center;
	align-items: center;
	z-index: 1000;
}

.modal-content {
	background: white;
	padding: 2rem;
	border-radius: 8px;
	max-width: 500px;
	width: 90%;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal-content h3 {
	margin-top: 0;
	margin-bottom: 1rem;
	color: #2c3e50;
}

.modal-actions {
	display: flex;
	gap: 1rem;
	margin-top: 1.5rem;
	justify-content: flex-end;
}

.password-display {
	background-color: #f5f5f5;
	padding: 1rem;
	border-radius: 4px;
	margin: 1rem 0;
	font-family: monospace;
}

.password-display p {
	margin: 0.5rem 0;
}
</style>
