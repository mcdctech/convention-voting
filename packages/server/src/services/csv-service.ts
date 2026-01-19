/**
 * CSV parsing and user/pool import service
 */
import { Readable } from "node:stream";
import { parse } from "csv-parse";
import pino from "pino";
import { createUser } from "./user-service.js";
import { createPool } from "./pool-service.js";
import type { UserCSVRow, PoolCSVRow } from "@mcdc-convention-voting/shared";

const logger = pino({ name: "csv-service" });

// CSV parsing constants
const CSV_ROW_OFFSET = 2; // CSV rows start at 1 and we have a header
const FIRST_POOL_KEY_INDEX = 1;
const MAX_POOL_KEYS = 10;
const COUNTER_INCREMENT = 1;
const EMPTY_ARRAY_LENGTH = 0;

// Valid user types for CSV import
const VALID_USER_TYPES = new Set<string>(["voter", "admin", "watcher"]);

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

interface CSVImportResult {
	success: number;
	failed: number;
	errors: Array<{ row: number; voterId: string; error: string }>;
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

		parser.on("readable", () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- csv-parse read() returns any
			let record: UserCSVRow | null = parser.read();
			while (record !== null) {
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
							poolKeys.push(poolKey.trim());
						}
					}

					// Create user
					// eslint-disable-next-line no-await-in-loop -- Sequential user creation required for CSV import
					await createUser({
						voterId: voterIdValue,
						firstName: firstNameValue,
						lastName: lastNameValue,
						poolKeys:
							poolKeys.length > EMPTY_ARRAY_LENGTH ? poolKeys : undefined,
						isAdmin,
						isWatcher,
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

		parser.on("readable", () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- csv-parse read() returns any
			let record: PoolCSVRow | null = parser.read();
			while (record !== null) {
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
			// Process records sequentially
			for (let i = 0; i < records.length; i += COUNTER_INCREMENT) {
				const { [i]: record } = records;
				const rowNumber = i + CSV_ROW_OFFSET;

				// Validate required fields
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- csv-parse types don't reflect runtime nullability
				const poolKeyValue = record.pool_key ?? "";
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- csv-parse types don't reflect runtime nullability
				const poolNameValue = record.pool_name ?? "";

				try {
					// Validate required fields
					if (poolKeyValue === "" || poolNameValue === "") {
						throw new Error("Missing required fields (pool_key, pool_name)");
					}

					// Create pool
					// eslint-disable-next-line no-await-in-loop -- Sequential pool creation required for CSV import
					await createPool({
						poolKey: poolKeyValue,
						poolName: poolNameValue,
						description: record.description,
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
