/**
 * CSV parsing and user import service
 */
import { Readable } from "node:stream";
import { parse } from "csv-parse";
import pino from "pino";
import { createUser } from "./user-service.js";
import type { UserCSVRow } from "@mcdc-convention-voting/shared";

const logger = pino({ name: "csv-service" });

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

  return await new Promise((resolve, reject) => {
    const stream = Readable.from(csvBuffer);
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const records: UserCSVRow[] = [];

    parser.on("readable", () => {
      let record;
      while ((record = parser.read()) !== null) {
        records.push(record);
      }
    });

    parser.on("error", (error) => {
      logger.error({ error }, "CSV parsing error");
      reject(new Error(`CSV parsing error: ${error.message}`));
    });

    parser.on("end", async () => {
      // Process records sequentially
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const rowNumber = i + 2; // +2 because CSV rows start at 1 and we have a header

        try {
          // Validate required fields
          if (!record.voter_id || !record.first_name || !record.last_name) {
            throw new Error(
              "Missing required fields (voter_id, first_name, last_name)",
            );
          }

          // Create user
          await createUser({
            voterId: record.voter_id,
            firstName: record.first_name,
            lastName: record.last_name,
          });

          result.success++;
          logger.info(
            { voterId: record.voter_id },
            "User created successfully",
          );
        } catch (error) {
          result.failed++;
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          result.errors.push({
            row: rowNumber,
            voterId: record.voter_id || "unknown",
            error: errorMessage,
          });
          logger.error(
            { voterId: record.voter_id, error },
            "Failed to create user",
          );
        }
      }

      resolve(result);
    });

    stream.pipe(parser);
  });
}
