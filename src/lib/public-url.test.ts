import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPublicRouteUrl, formatShortEventUrl } from "./public-url";

describe("public URL helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds an absolute public room URL from the configured event origin", () => {
    expect(buildPublicRouteUrl("/room", "https://event.example.com/")).toBe(
      "https://event.example.com/room",
    );
  });

  it("falls back to the route path when the event origin is missing or invalid", () => {
    expect(buildPublicRouteUrl("/room", "")).toBe("/room");
    expect(buildPublicRouteUrl("/room", "not a url")).toBe("/room");
  });

  it("rejects unsafe QR origins in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => buildPublicRouteUrl("/room", "")).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => buildPublicRouteUrl("/room", "/relative")).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => buildPublicRouteUrl("/room", "not a url")).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => buildPublicRouteUrl("/room", "http://localhost:3000")).toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    );
  });

  it("formats a short event URL for display below the QR code", () => {
    expect(formatShortEventUrl("https://event.example.com/room")).toBe("event.example.com/room");
    expect(formatShortEventUrl("/room")).toBe("/room");
  });
});
