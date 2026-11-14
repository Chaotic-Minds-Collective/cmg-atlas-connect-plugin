const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_CLAIM_LIMIT = 100;
const MIN_LEASE_SECONDS = 15;
const MAX_LEASE_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(field + " must be a non-empty string");
  }
  return value.trim();
}

function uuid(value, field) {
  const result = nonEmptyString(value, field);
  if (!UUID.test(result)) throw new TypeError(field + " must be a UUID");
  return result;
}

function positiveInteger(value, field, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(field + " must be an integer from " + minimum + " to " + maximum);
  }
  return value;
}

function validateBaseUrl(value) {
  const raw = nonEmptyString(value, "baseUrl");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError("baseUrl must be a valid HTTPS origin");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new TypeError("baseUrl must be an HTTPS origin without credentials, path, query, or fragment");
  }
  return url.origin;
}

async function readResponse(response) {
  if (!response || typeof response !== "object" ||
      typeof response.ok !== "boolean" || typeof response.status !== "number") {
    throw new TypeError("Core response must be a Fetch API Response");
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new TypeError("Core response returned invalid JSON");
  }
  if (!response.ok) {
    const code = body?.error?.code;
    const message = typeof body?.error?.message === "string"
      ? body.error.message : "Core request failed";
    const error = new Error(message);
    error.name = "CoreOutboxRequestError";
    error.status = response.status;
    error.code = typeof code === "string" ? code : "CORE_REQUEST_FAILED";
    throw error;
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !Object.hasOwn(body, "data")) {
    throw new TypeError("Core response must contain a data field");
  }
  return body.data;
}

/**
 * Create an explicitly invoked client for Core's server-scoped game-event
 * outbox. Claiming and acknowledging are separate operations; this client
 * never schedules polling or performs downstream delivery.
 */
export function createCoreEventOutboxClient(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options must be an object");
  }
  const baseUrl = validateBaseUrl(options.baseUrl);
  const serviceToken = nonEmptyString(options.serviceToken, "serviceToken");
  const serverId = uuid(options.serverId, "serverId");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  positiveInteger(timeoutMs, "timeoutMs", 100, MAX_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  async function request(path, body) {
    const response = await fetchImpl(baseUrl + path, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: "Bearer " + serviceToken
      },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs)
    });
    return readResponse(response);
  }

  async function claim(options = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("claim options must be an object");
    }
    const limit = options.limit ?? 25;
    const leaseSeconds = options.leaseSeconds ?? 120;
    positiveInteger(limit, "limit", 1, MAX_CLAIM_LIMIT);
    positiveInteger(leaseSeconds, "leaseSeconds", MIN_LEASE_SECONDS, MAX_LEASE_SECONDS);

    const path = "/integrations/servers/" + encodeURIComponent(serverId) + "/events/claim";
    const data = await request(path, { limit, leaseSeconds });
    if (!Array.isArray(data)) throw new TypeError("Core claim response data must be an array");
    return Object.freeze(data.map((event, index) => {
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        throw new TypeError("Core claim response data[" + index + "] must be an object");
      }
      uuid(event.id, "claimed event id");
      uuid(event.leaseToken, "claimed event leaseToken");
      if (event.eventType !== "game.event.received" ||
          !event.payload || typeof event.payload !== "object" ||
          Array.isArray(event.payload) ||
          event.payload.serverId !== serverId) {
        throw new TypeError("Core claim response contains an event outside the requested server scope");
      }
      return Object.freeze({ ...event });
    }));
  }

  async function acknowledge(event, outcome, error) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new TypeError("event must be a claimed event object");
    }
    const eventId = uuid(event.id, "event.id");
    const leaseToken = uuid(event.leaseToken, "event.leaseToken");
    if (outcome !== "delivered" && outcome !== "failed") {
      throw new TypeError("outcome must be delivered or failed");
    }
    if (error !== undefined && (typeof error !== "string" || error.length > 1000)) {
      throw new TypeError("error must be a string no longer than 1000 characters");
    }
    if (outcome === "delivered" && error !== undefined) {
      throw new TypeError("error is only valid when outcome is failed");
    }
    const body = { leaseToken, outcome };
    if (error !== undefined) body.error = error;
    const path = "/integrations/servers/" + encodeURIComponent(serverId) +
      "/events/" + encodeURIComponent(eventId) + "/ack";
    const data = await request(path, body);
    if (!data || data.accepted !== true || data.eventId !== eventId) {
      throw new TypeError("Core acknowledgement response did not confirm the requested event");
    }
    return Object.freeze({ ...data });
  }

  return Object.freeze({
    claim,
    acknowledge,
    serverId
  });
}

export const CORE_EVENT_OUTBOX_CLIENT_DEFAULTS = Object.freeze({
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxTimeoutMs: MAX_TIMEOUT_MS,
  claimLimit: 25,
  maxClaimLimit: MAX_CLAIM_LIMIT,
  leaseSeconds: 120,
  minLeaseSeconds: MIN_LEASE_SECONDS,
  maxLeaseSeconds: MAX_LEASE_SECONDS
});
