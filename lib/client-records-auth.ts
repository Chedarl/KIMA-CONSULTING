import { isAuthRetryableFetchError, isAuthSessionMissingError } from "@supabase/auth-js";

export type RecordsAuthFailure = "signed-out" | "offline";

/** HTTP status, ignoring 0 which auth-js uses when the request never completed. */
function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  if (typeof status !== "number" || !Number.isInteger(status) || status < 100) return undefined;
  return status;
}

/**
 * getUser() in auth-js 2.118 raises AuthSessionMissingError (status 400) when
 * nobody is signed in. That is not a network failure. 401 and 403 are the same
 * outcome. Offline is only a retryable fetch or an error with no HTTP status.
 */
export function recordsAuthFailure(error: unknown): RecordsAuthFailure {
  if (isAuthSessionMissingError(error)) return "signed-out";
  const status = httpStatus(error);
  if (status === 401 || status === 403) return "signed-out";
  if (isAuthRetryableFetchError(error) || status === undefined) return "offline";
  return "offline";
}
