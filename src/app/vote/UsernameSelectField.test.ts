import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { UsernameSelectField } = await import("./UsernameSelectField");

describe("UsernameSelectField", () => {
  it("keeps a native select and reserves a fixed custom-chevron inset", () => {
    const longName = "Very Long start.gg Username ".repeat(5).slice(0, 100);
    const html = renderToStaticMarkup(
      createElement(UsernameSelectField, {
        disabled: false,
        onChange: () => undefined,
        players: [{ id: "player-1", startggUsername: longName }],
        value: "player-1",
      }),
    );

    expect(html).toContain("Select your start.gg username");
    expect(html).toContain('<select id="startgg-username"');
    expect(html).toContain("appearance-none");
    expect(html).toContain("min-h-11");
    expect(html).toContain("pr-12");
    expect(html).toContain("truncate");
    expect(html).toContain(longName);
    expect(html).toContain('data-testid="startgg-select-chevron"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("right-4");
  });

  it("preserves the native disabled state", () => {
    const html = renderToStaticMarkup(
      createElement(UsernameSelectField, {
        disabled: true,
        onChange: () => undefined,
        players: [],
        value: "",
      }),
    );

    expect(html).toContain("<select");
    expect(html).toContain(' disabled=""');
  });
});
