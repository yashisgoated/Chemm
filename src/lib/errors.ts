export const ErrorCode = {
  AUTH_ERROR: "AUTH_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  MESSAGE_SEND_FAILED: "MESSAGE_SEND_FAILED",
  CALL_FAILED: "CALL_FAILED",
  CALL_EXPIRED: "CALL_EXPIRED",
  NETWORK_ERROR: "NETWORK_ERROR",
  FIREBASE_ERROR: "FIREBASE_ERROR",
  ENCRYPTION_ERROR: "ENCRYPTION_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  BLOCKED: "BLOCKED",
  CONFLICT: "CONFLICT",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const USER_MESSAGES: Record<ErrorCode, string> = {
  AUTH_ERROR: "Authentication failed. Please try again.",
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You don’t have permission to do that.",
  USER_NOT_FOUND: "No user found with that CHEMM Number.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  MESSAGE_SEND_FAILED: "Couldn’t send that message. Tap to retry.",
  CALL_FAILED: "The call couldn’t connect.",
  CALL_EXPIRED: "This call is no longer available.",
  NETWORK_ERROR: "You’re offline or the network is unavailable.",
  FIREBASE_ERROR: "Something went wrong with the service. Try again.",
  ENCRYPTION_ERROR: "Couldn’t encrypt or decrypt this message securely.",
  VALIDATION_ERROR: "Please check your input and try again.",
  BLOCKED: "This action isn’t allowed with this user.",
  CONFLICT: "That action conflicts with an existing record.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly technical?: string;

  constructor(code: ErrorCode, technical?: string) {
    super(USER_MESSAGES[code] ?? "Something went wrong.");
    this.name = "AppError";
    this.code = code;
    this.technical = technical;
  }
}

export function toAppError(error: unknown, fallback: ErrorCode = ErrorCode.FIREBASE_ERROR): AppError {
  if (error instanceof AppError) return error;
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : undefined;
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  if (code === "permission-denied") return new AppError(ErrorCode.FORBIDDEN, msg);
  if (code.includes("auth/")) return new AppError(ErrorCode.AUTH_ERROR, msg);
  if (msg?.includes("RATE_LIMITED") || code === "resource-exhausted") {
    return new AppError(ErrorCode.RATE_LIMITED, msg);
  }
  if (msg?.toLowerCase().includes("network") || code === "unavailable") {
    return new AppError(ErrorCode.NETWORK_ERROR, msg);
  }
  return new AppError(fallback, msg);
}

export function userFacingMessage(error: unknown): string {
  return toAppError(error).message;
}

export function logDiagnostic(scope: string, error: unknown): void {
  if (process.env.NODE_ENV === "production") return;
  const tech = error instanceof AppError ? error.technical : error;
  console.warn(`[${scope}]`, tech ?? error);
}
