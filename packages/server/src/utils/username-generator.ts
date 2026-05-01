/**
 * Username generation utilities
 */

const FIRST_CHARACTER_INDEX = 0;
const EMPTY_STRING_LENGTH = 0;
const INITIAL_COUNTER = 2;
const COUNTER_INCREMENT = 1;

/**
 * Generate a username from first and last name
 * Format: first initial + last name (lowercase, alphanumeric)
 * Example: John Doe -> jdoe, Test 100080 -> t100080
 *
 * @param firstName User's first name
 * @param lastName User's last name
 * @returns Generated base username (without conflict resolution)
 */
export function generateBaseUsername(
	firstName: string,
	lastName: string,
): string {
	const firstInitial = firstName.charAt(FIRST_CHARACTER_INDEX).toLowerCase();
	// Allow both letters and numbers, remove only special characters and spaces
	const lastNameClean = lastName.toLowerCase().replace(/[^a-z0-9]/g, "");

	// Fallback to "user" if lastName becomes empty after cleaning
	const lastNamePart =
		lastNameClean.length > EMPTY_STRING_LENGTH ? lastNameClean : "user";

	return `${firstInitial}${lastNamePart}`;
}

/**
 * Generate a username with conflict resolution
 * If the base username exists, appends incrementing numbers: jdoe, jdoe2, jdoe3, etc.
 *
 * @param firstName User's first name
 * @param lastName User's last name
 * @param checkExists Function that returns true if username exists
 * @returns Unique username
 */
export async function generateUniqueUsername(
	firstName: string,
	lastName: string,
	checkExists: (username: string) => Promise<boolean>,
): Promise<string> {
	const baseUsername = generateBaseUsername(firstName, lastName);
	let username = baseUsername;
	let counter = INITIAL_COUNTER;

	// Keep incrementing counter until we find a unique username
	// eslint-disable-next-line no-await-in-loop -- Sequential checks required to find unique username
	while (await checkExists(username)) {
		username = `${baseUsername}${counter}`;
		counter += COUNTER_INCREMENT;
	}

	return username;
}
