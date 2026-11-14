import test from "node:test";
import assert from "node:assert/strict";
import { createCoreEventOutboxClient } from "../src/core-outbox-client.js";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const LEASE_TOKEN = "33333333-3333-4333-8333-333333333333";

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return status >= 400
        ? { error: { code: "EVENT_LEASE_INVALID", message: "Lease is invalid" } }
        : { data };
    }
  };
}

function createClient(fetchImpl) {
  return createCoreEventOutboxClient({
    baseUrl: "https://core.example.test",
    serviceToken: "secret-token",
    serverId: SERVER_ID,
    fetchImpl
  });
}

test("claims only the requested server scope and returns immutable claimed rows", async () => {
  let request;
  const client = createClient(async (url, options) => {
    request = { url, options };
    return response([{
      id: EVENT_ID,
      eventType: "game.event.received",
      payload: { serverId: SERVER_ID, eventType: "chat.global" },
      leaseToken: LEASE_TOKEN
    }]);
  });

  const events = await client.claim({ limit: 10, leaseSeconds: 60 });
  assert.equal(events.length, 1);
  assert.equal(events[0].id, EVENT_ID);
  assert.ok(Object.isFrozen(events));
  assert.ok(Object.isFrozen(events[0]));
  assert.equal(request.url, "https://core.example.test/integrations/servers/" + SERVER_ID + "/events/claim");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, "Bearer secret-token");
  assert.deepEqual(JSON.parse(request.options.body), { limit: 10, leaseSeconds: 60 });
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.redirect, "error");
});

test("rejects a claim response containing an event from another server", async () => {
  const client = createClient(async () => response([{
    id: EVENT_ID,
    eventType: "game.event.received",
    payload: { serverId: "44444444-4444-4444-8444-444444444444" },
    leaseToken: LEASE_TOKEN
  }]));
  await assert.rejects(client.claim(), /outside the requested server scope/);
});

test("acknowledges a claimed event with its per-event lease token", async () => {
  let request;
  const client = createClient(async (url, options) => {
    request = { url, options };
    return response({ accepted: true, duplicate: false, eventId: EVENT_ID, outcome: "delivered" }, 202);
  });
  const result = await client.acknowledge({ id: EVENT_ID, leaseToken: LEASE_TOKEN }, "delivered");
  assert.equal(result.accepted, true);
  assert.equal(request.url, "https://core.example.test/integrations/servers/" + SERVER_ID + "/events/" + EVENT_ID + "/ack");
  assert.deepEqual(JSON.parse(request.options.body), { leaseToken: LEASE_TOKEN, outcome: "delivered" });
});

test("reports a failed processing attempt without acknowledging delivery", async () => {
  let request;
  const client = createClient(async (_url, options) => {
    request = options;
    return response({ accepted: true, duplicate: false, eventId: EVENT_ID, outcome: "failed" }, 202);
  });
  await client.acknowledge({ id: EVENT_ID, leaseToken: LEASE_TOKEN }, "failed", "temporary downstream error");
  assert.deepEqual(JSON.parse(request.body), {
    leaseToken: LEASE_TOKEN,
    outcome: "failed",
    error: "temporary downstream error"
  });
});

test("surfaces Core lease conflicts with their HTTP status and code", async () => {
  const client = createClient(async () => response(null, 409));
  await assert.rejects(client.acknowledge(
    { id: EVENT_ID, leaseToken: LEASE_TOKEN }, "delivered"
  ), (error) => error.status === 409 && error.code === "EVENT_LEASE_INVALID");
});

test("validates HTTPS origin, server UUID, claim bounds and acknowledgement inputs", async () => {
  assert.throws(() => createCoreEventOutboxClient({
    baseUrl: "http://core.example.test", serviceToken: "token", serverId: SERVER_ID
  }), /HTTPS origin/);
  assert.throws(() => createCoreEventOutboxClient({
    baseUrl: "https://core.example.test/path", serviceToken: "token", serverId: SERVER_ID
  }), /HTTPS origin/);
  assert.throws(() => createCoreEventOutboxClient({
    baseUrl: "https://core.example.test", serviceToken: "token", serverId: "server-1"
  }), /UUID/);

  const client = createClient(async () => response([]));
  await assert.rejects(client.claim({ limit: 101 }), /limit must be an integer/);
  await assert.rejects(client.claim({ leaseSeconds: 10 }), /leaseSeconds must be an integer/);
  await assert.rejects(client.acknowledge({ id: EVENT_ID, leaseToken: LEASE_TOKEN }, "unknown"), /outcome/);
});
