import { describe, expect, it } from "vitest";
import { createClientRequestId } from "./request-id";

describe("createClientRequestId", () => {
  it("returns distinct UUID-formatted idempotency keys", () => {
    const first = createClientRequestId();
    const second = createClientRequestId();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(first).toMatch(uuidPattern);
    expect(second).toMatch(uuidPattern);
    expect(second).not.toBe(first);
  });
});
