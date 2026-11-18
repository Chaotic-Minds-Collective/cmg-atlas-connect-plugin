import test from "node:test";
import assert from "node:assert/strict";
import * as connect from "@chaotic-minds-gaming/atlas-connect";

test("package root exports the existing public Connect contracts", () => {
  for (const name of [
    "normalizeConnectMessage",
    "evaluateConnectRelay",
    "recordConnectRelayDelivery",
    "createDeliveryIdempotencyKey",
    "evaluateDeliveryFailure",
    "normalizeCoreChatEvent",
    "createCoreEventOutboxClient"
  ]) {
    assert.equal(typeof connect[name], "function", `${name} must be exported`);
  }

  for (const name of [
    "CONNECT_MESSAGE_DEFAULTS",
    "CONNECT_DELIVERY_DEFAULTS",
    "CORE_EVENT_OUTBOX_CLIENT_DEFAULTS"
  ]) {
    assert.ok(Object.hasOwn(connect, name), `${name} must be exported`);
  }
});

test("documented subpath exports resolve", async () => {
  const message = await import("@chaotic-minds-gaming/atlas-connect/message");
  const delivery = await import("@chaotic-minds-gaming/atlas-connect/delivery");
  const coreEvent = await import("@chaotic-minds-gaming/atlas-connect/core-event");
  const outbox = await import("@chaotic-minds-gaming/atlas-connect/core-outbox-client");

  assert.equal(typeof message.normalizeConnectMessage, "function");
  assert.equal(typeof delivery.evaluateDeliveryFailure, "function");
  assert.equal(typeof coreEvent.normalizeCoreChatEvent, "function");
  assert.equal(typeof outbox.createCoreEventOutboxClient, "function");
});
