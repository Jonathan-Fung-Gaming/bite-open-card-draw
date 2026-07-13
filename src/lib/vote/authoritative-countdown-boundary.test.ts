import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("authoritative countdown client boundary", () => {
  it("keeps visual ticks local and free of server or persistence dependencies", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/client/use-authoritative-countdown.ts"),
      "utf8",
    );

    expect(source).toContain("window.performance.now()");
    expect(source).toContain("window.setInterval");
    expect(source).not.toMatch(
      /@\/lib\/server|supabase|persistence|fetch\(|useRouter|router\.refresh/,
    );
  });
});
