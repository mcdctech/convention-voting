/**
 * CSV parsing and user/pool import service
 */
import { Readable } from "node:stream";
import { parse } from "csv-parse";
import pino from "pino";
import { upsertUser } from "./user-service.js";
import { upsertPool } from "./pool-service.js";
import type { UserCSVRow, PoolCSVRow } from "@mcdc-convention-voting/shared";

const logger = pino({ name: "csv-service" });

// CSV parsing constants
const CSV_ROW_OFFSET = 2; // CSV rows start at 1 and we have a header
const FIRST_POOL_KEY_INDEX = 1;
const MAX_POOL_KEYS = 10;
const COUNTER_INCREMENT = 1;
const EMPTY_ARRAY_LENGTH = 0;
const MAX_FIELD_LENGTH = 255;
const TRUNCATE_LENGTH = 50;
const STRING_START_INDEX = 0;

// Validation regex patterns
// Voter ID: ASCII alphanumeric, hyphens, underscores (no spaces)
const VOTER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
// Names: ASCII letters, spaces, hyphens, apostrophes
const NAME_PATTERN = /^[A-Za-z\s'-]+$/;
// Pool key: letters (case-sensitive), numbers, hyphens, underscores, spaces
const POOL_KEY_PATTERN = /^[A-Za-z0-9_\- ]+$/;
// Printable ASCII: characters from space (32) to tilde (126)
const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7E]*$/;

// Required headers for CSV files
const REQUIRED_USER_HEADERS = [
	"voter_id",
	"first_name",
	"last_name",
	"is_enabled",
];
const REQUIRED_POOL_HEADERS = ["pool_key", "pool_name"];

interface ValidationResult {
	isValid: boolean;
	error?: string;
}

/**
 * Truncate a value for display in error messages
 */
function truncateValue(value: string): string {
	if (value.length <= TRUNCATE_LENGTH) {
		return value;
	}
	return `${value.substring(STRING_START_INDEX, TRUNCATE_LENGTH)}...`;
}

/**
 * Validate voter ID format
 */
function validateVoterId(value: string): ValidationResult {
	if (value.length > MAX_FIELD_LENGTH) {
		return {
			isValid: false,
			error: `voter_id exceeds maximum length of ${MAX_FIELD_LENGTH} characters`,
		};
	}
	if (!VOTER_ID_PATTERN.test(value)) {
		return {
			isValid: false,
			error: `voter_id contains invalid characters (got: "${truncateValue(value)}"). Only ASCII letters, numbers, hyphens, and underscores allowed.`,
		};
	}
	return { isValid: true };
}

/**
 * Validate name format (first_name or last_name)
 */
function validateName(fieldName: string, value: string): ValidationResult {
	if (value.length > MAX_FIELD_LENGTH) {
		return {
			isValid: false,
			error: `${fieldName} exceeds maximum length of ${MAX_FIELD_LENGTH} characters`,
		};
	}
	if (!NAME_PATTERN.test(value)) {
		return {
			isValid: false,
			error: `${fieldName} contains invalid characters (got: "${truncateValue(value)}"). Only ASCII letters, spaces, hyphens, and apostrophes allowed.`,
		};
	}
	return { isValid: true };
}

/**
 * Validate pool key format
 */
function validatePoolKey(value: string): ValidationResult {
	if (value.length > MAX_FIELD_LENGTH) {
		return {
			isValid: false,
			error: `pool_key exceeds maximum length of ${MAX_FIELD_LENGTH} characters`,
		};
	}
	if (!POOL_KEY_PATTERN.test(value)) {
		return {
			isValid: false,
			error: `pool_key contains invalid characters (got: "${truncateValue(value)}"). Only letters, numbers, hyphens, underscores, and spaces allowed.`,
		};
	}
	return { isValid: true };
}

/**
 * Validate pool name format
 */
function validatePoolName(value: string): ValidationResult {
	if (value.length > MAX_FIELD_LENGTH) {
		return {
			isValid: false,
			error: `pool_name exceeds maximum length of ${MAX_FIELD_LENGTH} characters`,
		};
	}
	if (!PRINTABLE_ASCII_PATTERN.test(value)) {
		return {
			isValid: false,
			error: `pool_name contains invalid characters (got: "${truncateValue(value)}"). Only printable ASCII characters allowed.`,
		};
	}
	return { isValid: true };
}

/**
 * Validate description format (optional field)
 */
function validateDescription(value: string): ValidationResult {
	if (!PRINTABLE_ASCII_PATTERN.test(value)) {
		return {
			isValid: false,
			error: `description contains invalid characters (got: "${truncateValue(value)}"). Only printable ASCII characters allowed.`,
		};
	}
	return { isValid: true };
}

/**
 * Validate that required headers are present in CSV
 */
function validateHeaders(
	actualHeaders: string[],
	requiredHeaders: string[],
): ValidationResult {
	const missingHeaders = requiredHeaders.filter(
		(header) => !actualHeaders.includes(header),
	);
	if (missingHeaders.length > EMPTY_ARRAY_LENGTH) {
		return {
			isValid: false,
			error: `Missing required CSV headers: ${missingHeaders.join(", ")}`,
		};
	}
	return { isValid: true };
}

// Valid user types for CSV import
const VALID_USER_TYPES = new Set<string>(["voter", "admin", "watcher"]);

// Valid is_enabled values for CSV import
const ENABLED_VALUES = new Set<string>(["true", "1"]);
const DISABLED_VALUES = new Set<string>(["false", "0"]);

/**
 * Parse user_type from CSV and return isAdmin/isWatcher flags
 */
function parseUserType(userType: string | undefined): {
	isAdmin: boolean;
	isWatcher: boolean;
} {
	const trimmedType = userType?.trim().toLowerCase() ?? "";

	if (trimmedType === "" || trimmedType === "voter") {
		return { isAdmin: false, isWatcher: false };
	}

	if (!VALID_USER_TYPES.has(trimmedType)) {
		throw new Error(
			`Invalid user_type "${userType}". Must be one of: voter, admin, watcher`,
		);
	}

	return {
		isAdmin: trimmedType === "admin",
		isWatcher: trimmedType === "watcher",
	};
}

/**
 * Parse is_enabled from CSV and return isEnabled boolean
 * Field is required - empty/missing values will throw an error
 */
function parseIsEnabled(value: string | undefined): boolean {
	const trimmed = value?.trim().toLowerCase() ?? "";

	// Field is required - empty/missing is an error
	if (trimmed === "") {
		throw new Error(
			"is_enabled is required. Must be one of: true, false, 1, 0",
		);
	}

	if (ENABLED_VALUES.has(trimmed)) {
		return true;
	}

	if (DISABLED_VALUES.has(trimmed)) {
		return false;
	}

	throw new Error(
		`Invalid is_enabled value "${value}". Must be one of: true, false, 1, 0`,
	);
}

interface CSVImportResult {
	success: number;
	failed: number;
	errors: Array<{ row: number; voterId: string; error: string }>;
}

interface ValidatedPoolRow {
	poolKey: string;
	poolName: string;
	description?: string;
}

/**
 * Validate all fields in a pool CSV row
 * @throws Error if validation fails
 */
function validatePoolRow(
	poolKeyValue: string,
	poolNameValue: string,
	descriptionValue: string,
): ValidatedPoolRow {
	// Validate required fields
	if (poolKeyValue === "" || poolNameValue === "") {
		throw new Error("Missing required fields (pool_key, pool_name)");
	}

	// Validate pool_key format
	const poolKeyValidation = validatePoolKey(poolKeyValue);
	if (!poolKeyValidation.isValid) {
		throw new Error(poolKeyValidation.error);
	}

	// Validate pool_name format
	const poolNameValidation = validatePoolName(poolNameValue);
	if (!poolNameValidation.isValid) {
		throw new Error(poolNameValidation.error);
	}

	// Validate description format if provided
	if (descriptionValue !== "") {
		const descriptionValidation = validateDescription(descriptionValue);
		if (!descriptionValidation.isValid) {
			throw new Error(descriptionValidation.error);
		}
	}

	return {
		poolKey: poolKeyValue,
		poolName: poolNameValue,
		description: descriptionValue === "" ? undefined : descriptionValue,
	};
}

/**
 * Parse and import users from CSV buffer
 */
export async function importUsersFromCSV(
	csvBuffer: Buffer,
): Promise<CSVImportResult> {
	const result: CSVImportResult = {
		success: 0,
		failed: 0,
		errors: [],
	};

	// Promise wrapper needed for streaming CSV parser
	// eslint-disable-next-line promise/avoid-new -- Required for csv-parse stream handling
	return await new Promise((resolve, reject) => {
		const stream = Readable.from(csvBuffer);
		const parser = parse({
			columns: true,
			skip_empty_lines: true,
			trim: true,
		});

		const records: UserCSVRow[] = [];
		let headers: string[] = [];

		parser.on("readable", () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- csv-parse read() returns any
			let record: UserCSVRow | null = parser.read();
			while (record !== null) {
				// Capture headers from first record
				if (headers.length === EMPTY_ARRAY_LENGTH) {
					headers = Object.keys(record);
				}
				records.push(record);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- csv-parse read() returns any
				record = parser.read();
			}
		});

		parser.on("error", (error) => {
			logger.error({ error }, "CSV parsing error");
			reject(new Error(`CSV parsing error: ${error.message}`));
		});

		// eslint-disable-next-line @typescript-eslint/no-misused-promises, complexity -- Event handler requires async. CSV processing has high complexity due to validation and error handling branches
		parser.on("end", async () => {
			// Validate headers first
			const headerValidation = validateHeaders(headers, REQUIRED_USER_HEADERS);
			if (!headerValidation.isValid) {
				reject(new Error(headerValidation.error));
				return;
			}

			// Process records sequentially
			for (let i = 0; i < records.length; i += COUNTER_INCREMENT) {
				const { [i]: record } = records;
				const rowNumber = i + CSV_ROW_OFFSET;

				// Validate required fields
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- csv-parse types don't reflect runtime nullability
				const voterIdValue = record.voter_id ?? "";
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- csv-parse types don't reflect runtime nullability
				const firstNameValue = record.first_name ?? "";
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- csv-parse types don't reflect runtime nullability
				const lastNameValue = record.last_name ?? "";

				try {
					if (
						voterIdValue === "" ||
						firstNameValue === "" ||
						lastNameValue === ""
					) {
						throw new Error(
							"Missing required fields (voter_id, first_name, last_name)",
						);
					}

					// Parse user type (defaults to voter if not specified)
					const { isAdmin, isWatcher } = parseUserType(record.user_type);

					// Parse is_enabled (required field)
					const isEnabled = parseIsEnabled(record.is_enabled);

					// Validate voter_id format
					const voterIdValidation = validateVoterId(voterIdValue);
					if (!voterIdValidation.isValid) {
						throw new Error(voterIdValidation.error);
					}

					// Validate first_name format
					const firstNameValidation = validateName(
						"first_name",
						firstNameValue,
					);
					if (!firstNameValidation.isValid) {
						throw new Error(firstNameValidation.error);
					}

					// Validate last_name format
					const lastNameValidation = validateName("last_name", lastNameValue);
					if (!lastNameValidation.isValid) {
						throw new Error(lastNameValidation.error);
					}

					// Extract pool keys from CSV row (pool_key_1 through pool_key_10)
					const poolKeys: string[] = [];
					for (
						let j = FIRST_POOL_KEY_INDEX;
						j <= MAX_POOL_KEYS;
						j += COUNTER_INCREMENT
					) {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Dynamic key access requires runtime type assertion
						const key = `pool_key_${j}` as keyof UserCSVRow;
						const { [key]: poolKey } = record;
						const trimmedPoolKey = poolKey?.trim() ?? "";
						if (poolKey !== undefined && trimmedPoolKey !== "") {
							// Validate pool key format
							const poolKeyValidation = validatePoolKey(trimmedPoolKey);
							if (!poolKeyValidation.isValid) {
								throw new Error(`${key}: ${poolKeyValidation.error}`);
							}
							poolKeys.push(trimmedPoolKey);
						}
					}

					// Upsert user (insert or update on conflict for idempotent uploads)
					// eslint-disable-next-line no-await-in-loop -- Sequential user creation required for CSV import
					await upsertUser({
						voterId: voterIdValue,
						firstName: firstNameValue,
						lastName: lastNameValue,
						poolKeys:
							poolKeys.length > EMPTY_ARRAY_LENGTH ? poolKeys : undefined,
						isAdmin,
						isWatcher,
						isDisabled: !isEnabled,
					});

					result.success += COUNTER_INCREMENT;
					logger.info({ voterId: voterIdValue }, "User created successfully");
				} catch (unknownError: unknown) {
					result.failed += COUNTER_INCREMENT;
					const { message: errorMessage } =
						unknownError instanceof Error
							? unknownError
							: new Error("Unknown error");
					const errorVoterId = voterIdValue === "" ? "unknown" : voterIdValue;
					result.errors.push({
						row: rowNumber,
						voterId: errorVoterId,
						error: errorMessage,
					});
					logger.error(
						{ voterId: voterIdValue, error: unknownError },
						"Failed to create user",
					);
				}
			}

			resolve(result);
		});

		stream.pipe(parser);
	});
}

/**
 * Parse and import pools from CSV buffer
 */
export async function importPoolsFromCSV(
	csvBuffer: Buffer,
): Promise<CSVImportResult> {
	const result: CSVImportResult = {
		success: 0,
		failed: 0,
		errors: [],
	};

	// Promise wrapper needed for streaming CSV parser
	// eslint-disable-next-line promise/avoid-new -- Required for csv-parse stream handling
	return await new Promise((resolve, reject) => {
		const stream = Readable.from(csvBuffer);
		const parser = parse({
			columns: true,
			skip_empty_lines: true,
			trim: true,
		});

		const records: PoolCSVRow[] = [];
		let headers: string[] = [];

		parser.on("readable", () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- csv-parse read() returns any
			let record: PoolCSVRow | null = parser.read();
			while (record !== null) {
				// Capture headers from first record
				if (headers.length === EMPTY_ARRAY_LENGTH) {
					headers = Object.keys(record);
				}
				records.push(record);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- csv-parse read() returns any
				record = parser.read();
			}
		});

		parser.on("error", (error) => {
			logger.error({ error }, "CSV parsing error");
			reject(new Error(`CSV parsing error: ${error.message}`));
		});

		// eslint-disable-next-line @typescript-eslint/no-misused-promises -- Event handler requires async for sequential processing
		parser.on("end", async () => {
			// Validate headers first
			const headerValidation = validateHeaders(headers, REQUIRED_POOL_HEADERS);
			if (!headerValidation.isValid) {
				reject(new Error(headerValidation.error));
				return;
			}

			// Process records sequentially
			for (let i = 0; i < records.length; i += COUNTER_INCREMENT) {
				const { [i]: record } = records;
				const rowNumber = i + CSV_ROW_OFFSET;

				// Extract field values
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- csv-parse types don't reflect runtime nullability
				const poolKeyValue = record.pool_key ?? "";
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- csv-parse types don't reflect runtime nullability
				const poolNameValue = record.pool_name ?? "";
				const descriptionValue = record.description ?? "";

				try {
					// Validate all fields and get validated data
					const validatedPool = validatePoolRow(
						poolKeyValue,
						poolNameValue,
						descriptionValue,
					);

					// Upsert pool (insert or update on conflict for idempotent uploads)
					// eslint-disable-next-line no-await-in-loop -- Sequential pool creation required for CSV import
					await upsertPool({
						poolKey: validatedPool.poolKey,
						poolName: validatedPool.poolName,
						description: validatedPool.description,
					});

					result.success += COUNTER_INCREMENT;
					logger.info({ poolKey: poolKeyValue }, "Pool created successfully");
				} catch (unknownError: unknown) {
					result.failed += COUNTER_INCREMENT;
					const { message: errorMessage } =
						unknownError instanceof Error
							? unknownError
							: new Error("Unknown error");
					const errorPoolKey = poolKeyValue === "" ? "unknown" : poolKeyValue;
					result.errors.push({
						row: rowNumber,
						voterId: errorPoolKey,
						error: errorMessage,
					});
					logger.error(
						{ poolKey: poolKeyValue, error: unknownError },
						"Failed to create pool",
					);
				}
			}

			resolve(result);
		});

		stream.pipe(parser);
	});
}
