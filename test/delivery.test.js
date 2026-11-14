import test from "node:test";
import assert from "node:assert/strict";
import {
  CONNECT_DELIVERY_DEFAULTS,
  createDeliveryIdempotencyKey,
  evaluateDeliveryFailure
} from "../src/delivery.js";

test("creates a stable key for the same message and destination", () => {
  const destination = { platform: "discord", channelId: "announcements" };
  const first = createDeliveryIdempotencyKey("message-1", destination);
  const second = createDeliveryIdempotencyKey("message-1", { ...destination });
  assert.equal(first, second);
});

test("separates destinations and avoids ambiguous identifier concatenation", () => {
  const keyA = createDeliveryIdempotencyKey("ab", { platform: "c", channelId: "d" });
  const keyB = createDeliveryIdempotencyKey("a", { platform: "bc", channelId: "d" });
  assert.notEqual(keyA, keyB);
  assert.notEqual(
    createDeliveryIdempotencyKey("message-1", { platform: "discord", channelId: "a" }),
    createDeliveryIdempotencyKey("message-1", { platform: "discord", channelId: "b" })
  );
});

test("rejects incomplete message or destination identity", () => {
  assert.throws(() => createDeliveryIdempotencyKey(" ", {
    platform: "discord", channelId: "x"
  }), /messageId/);
  assert.throws(() => createDeliveryIdempotencyKey("m1", null), /destination/);
  assert.throws(() => createDeliveryIdempotencyKey("m1", {
    platform: "discord", channelId: " "
  }), /channelId/);
});

test("retries transient HTTP failures with bounded exponential backoff", () => {
  assert.deepEqual(evaluateDeliveryFailure({ attempt: 1, statusCode: 503 }), {
    retry: true, exhausted: false, reason: "transient_http_failure", nextDelayMs: 1_000
  });
  assert.equal(evaluateDeliveryFailure({ attempt: 2, statusCode: 500 }).nextDelayMs, 2_000);
  assert.equal(evaluateDeliveryFailure({ attempt: 3, statusCode: 429 }).nextDelayMs, 4_000);
});

test("retries transport failures and honors a bounded retry-after hint", () => {
  const result = evaluateDeliveryFailure({
    attempt: 2, statusCode: null, retryAfterMs: 90_000
  });
  assert.equal(result.retry, true);
  assert.equal(result.reason, "transport_failure");
  assert.equal(result.nextDelayMs, CONNECT_DELIVERY_DEFAULTS.maxDelayMs);
});

test("does not retry permanent HTTP failures", () => {
  for (const statusCode of [301, 400, 401, 403, 404, 422]) {
    const result = evaluateDeliveryFailure({ attempt: 1, statusCode });
    assert.equal(result.retry, false);
    assert.equal(result.exhausted, false);
    assert.equal(result.reason, "permanent_failure");
    assert.equal(result.nextDelayMs, null);
  }
});

test("stops after the configured maximum attempt count", () => {
  const result = evaluateDeliveryFailure({
    attempt: 5, maxAttempts: 5, statusCode: 503
  });
  assert.deepEqual(result, {
    retry: false, exhausted: true, reason: "attempt_limit_reached", nextDelayMs: null
  });
});

test("validates attempt, status and retry-after inputs", () => {
  assert.throws(() => evaluateDeliveryFailure({ attempt: 0 }), /attempt/);
  assert.throws(() => evaluateDeliveryFailure({ attempt: 1, maxAttempts: 11 }), /maxAttempts/);
  assert.throws(() => evaluateDeliveryFailure({ attempt: 1, statusCode: 200 }), /failed HTTP/);
  assert.throws(() => evaluateDeliveryFailure({ attempt: 1, statusCode: 700 }), /statusCode/);
  assert.throws(() => evaluateDeliveryFailure({ attempt: 1, retryAfterMs: -1 }), /retryAfterMs/);
});
