const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);
const DEFAULT_MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;

function nonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function positiveInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${field} must be an integer from 1 to ${maximum}`);
  }
  return value;
}

/**
 * Build a stable key for one message-to-destination delivery.
 * Length-prefixing prevents ambiguous concatenations between identifiers.
 */
export function createDeliveryIdempotencyKey(messageId, destination) {
  const id = nonEmptyString(messageId, "messageId");
  if (!destination || typeof destination !== "object" || Array.isArray(destination)) {
    throw new TypeError("destination must be an object");
  }
  const platform = nonEmptyString(destination.platform, "destination.platform");
  const channelId = nonEmptyString(destination.channelId, "destination.channelId");
  return `cmg-connect:v1:${id.length}:${id}:${platform.length}:${platform}:${channelId.length}:${channelId}`;
}

/**
 * Classify a failed delivery and calculate a bounded retry delay.
 * statusCode=null represents a transport failure; HTTP 4xx failures are
 * permanent except 408, 425 and 429. The caller owns scheduling and storage.
 */
export function evaluateDeliveryFailure({
  attempt,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  statusCode = null,
  retryAfterMs = null
}) {
  positiveInteger(attempt, "attempt", 100);
  positiveInteger(maxAttempts, "maxAttempts", 10);

  if (statusCode !== null &&
      (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599)) {
    throw new RangeError("statusCode must be null or an HTTP status from 100 to 599");
  }
  if (statusCode !== null && statusCode < 300) {
    throw new RangeError("statusCode must describe a failed HTTP response");
  }
  if (retryAfterMs !== null &&
      (!Number.isFinite(retryAfterMs) || retryAfterMs < 0)) {
    throw new RangeError("retryAfterMs must be null or a non-negative finite number");
  }

  const retryable = statusCode === null ||
    RETRYABLE_STATUS_CODES.has(statusCode) ||
    (statusCode >= 500 && statusCode <= 599);

  if (!retryable) {
    return Object.freeze({
      retry: false,
      exhausted: false,
      reason: "permanent_failure",
      nextDelayMs: null
    });
  }

  if (attempt >= maxAttempts) {
    return Object.freeze({
      retry: false,
      exhausted: true,
      reason: "attempt_limit_reached",
      nextDelayMs: null
    });
  }

  const exponentialDelay = Math.min(
    BASE_DELAY_MS * (2 ** Math.min(attempt - 1, 16)),
    MAX_DELAY_MS
  );
  const requestedDelay = retryAfterMs === null
    ? exponentialDelay
    : retryAfterMs;

  return Object.freeze({
    retry: true,
    exhausted: false,
    reason: statusCode === null ? "transport_failure" : "transient_http_failure",
    nextDelayMs: Math.min(requestedDelay, MAX_DELAY_MS)
  });
}

export const CONNECT_DELIVERY_DEFAULTS = Object.freeze({
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
  baseDelayMs: BASE_DELAY_MS,
  maxDelayMs: MAX_DELAY_MS
});
