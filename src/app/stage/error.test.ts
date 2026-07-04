import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import StageError, { scheduleStageErrorAutoRetry, STAGE_ERROR_AUTO_RETRY_SECONDS } from "./error";

vi.mock("@/components", () => ({
  TournamentLogo: () => null,
}));

afterEach(() => {
  vi.useRealTimers();
});

describe("StageError", () => {
  it("renders automatic retry and operator recovery instructions", () => {
    const markup = renderToStaticMarkup(createElement(StageError, { reset: () => undefined }));

    expect(markup).toContain("Stage view interrupted");
    expect(markup).toContain(`Auto-retrying in ${STAGE_ERROR_AUTO_RETRY_SECONDS} seconds`);
    expect(markup).toContain("refresh the projector browser");
    expect(markup).toContain("Retry Stage View");
  });

  it("calls reset after the automatic retry delay", () => {
    vi.useFakeTimers();
    const reset = vi.fn();
    const cleanup = scheduleStageErrorAutoRetry(reset, () => undefined, {
      clearInterval: clearInterval as unknown as Window["clearInterval"],
      clearTimeout: clearTimeout as unknown as Window["clearTimeout"],
      setInterval: setInterval as unknown as Window["setInterval"],
      setTimeout: setTimeout as unknown as Window["setTimeout"],
    });

    vi.advanceTimersByTime(STAGE_ERROR_AUTO_RETRY_SECONDS * 1000 - 1);
    expect(reset).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(reset).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
