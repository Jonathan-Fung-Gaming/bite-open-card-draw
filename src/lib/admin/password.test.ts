import { describe, expect, it } from "vitest";
import { hashAdminPassword, verifyAdminPassword } from "./password";

describe("admin password hashing", () => {
  it("verifies a scrypt hash without storing plaintext", () => {
    const hash = hashAdminPassword("correct horse battery staple", "0123456789abcdef");

    expect(hash).not.toContain("correct horse");
    expect(verifyAdminPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyAdminPassword("wrong password", hash)).toBe(false);
  });
});
