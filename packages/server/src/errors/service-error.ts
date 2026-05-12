/**
 * Custom error class for service-layer errors.
 * Carries a structured error code for HTTP status mapping.
 */
import type { ServiceErrorCode } from "@mcdc-convention-voting/shared";

/**
 * ServiceError is thrown by service functions when business logic errors occur.
 * The error code determines the HTTP status code via ERROR_CODE_TO_HTTP_STATUS mapping.
 *
 * Usage:
 * ```typescript
 * throw new ServiceError(ServiceErrorCode.MOTION_NOT_FOUND, "Motion not found");
 * ```
 */
export class ServiceError extends Error {
	public readonly code: ServiceErrorCode;

	constructor(code: ServiceErrorCode, message: string) {
		super(message);
		this.name = "ServiceError";
		this.code = code;
	}
}
