/**
 * Username generation utilities
 */

const FIRST_CHARACTER_INDEX = 0;
const INITIAL_COUNTER = 2;
const COUNTER_INCREMENT = 1;

/**
 * Generate a username from first and last name
 * Format: first initial + last name (lowercase)
 * Example: John Doe -> jdoe
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
	const lastNameClean = lastName.toLowerCase().replace(/[^a-z]/g, "");

	return `${firstInitial}${lastNameClean}`;
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
