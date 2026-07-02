import type { Locator, Page, Request } from "@playwright/test";

export const HOSTED_REFRESH_TIMEOUT_MS = 90_000;
export const HOSTED_ACTION_TIMEOUT_MS = 15_000;
const HOSTED_SUPABASE_ACTION_SETTLE_MS = 5_000;

type ServerActionClickOptions = {
  postDataIncludes?: readonly string[];
  requireServerActionResponse?: boolean;
  responseTimeoutMs?: number;
  submitForm?: boolean;
};

export function requireBaseURL(baseURL: string | undefined) {
  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  return baseURL;
}

function getAdminPassword() {
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!password) {
    throw new Error("Missing E2E_ADMIN_PASSWORD from Playwright config.");
  }

  return password;
}

export const ADMIN_PASSWORD = getAdminPassword();

export function getTestRouteHeaders() {
  const token = process.env.E2E_TEST_ROUTE_TOKEN;

  if (!token) {
    throw new Error("Missing E2E_TEST_ROUTE_TOKEN from Playwright config.");
  }

  return { "x-tournament-test-token": token };
}

export function route(baseURL: string, path: string) {
  return new URL(path, baseURL).toString();
}

export async function goto(page: Page, baseURL: string, path: string) {
  await page.goto(route(baseURL, path), { waitUntil: "domcontentloaded" });
}

export async function clickServerAction(
  page: Page,
  target: Locator,
  settleMs = 2_000,
  options: ServerActionClickOptions = {},
) {
  const observedPosts: string[] = [];
  const onRequest = (request: Request) => {
    if (request.method() !== "POST" || !options.requireServerActionResponse) {
      return;
    }

    const headers = request.headers();
    const postData = request.postData() ?? "";
    const expectedPostData = options.postDataIncludes ?? [];

    observedPosts.push(
      JSON.stringify({
        contentType: headers["content-type"] ?? null,
        expectedMatches: expectedPostData.map((text) => postData.includes(text)),
        hasNextAction: Boolean(headers["next-action"]),
        postDataLength: postData.length,
        url: request.url(),
      }),
    );
  };
  const responsePromise = page
    .waitForResponse(
      (response) => {
        const request = response.request();

        if (request.method() !== "POST") {
          return false;
        }

        const headers = request.headers();
        const postData = request.postData() ?? "";
        const expectedPostData = options.postDataIncludes ?? [];

        if (expectedPostData.length > 0) {
          return expectedPostData.every((text) => postData.includes(text));
        }

        const isServerAction = Boolean(headers["next-action"] || postData.includes("$ACTION"));

        return isServerAction;
      },
      { timeout: options.responseTimeoutMs ?? HOSTED_ACTION_TIMEOUT_MS },
    )
    .catch(() => null);

  page.on("request", onRequest);
  if (options.submitForm) {
    await target.evaluate((element) => {
      if (!(element instanceof HTMLButtonElement) || !element.form) {
        throw new Error("Target is not a form submit button.");
      }

      element.form.requestSubmit(element);
    });
  } else {
    await target.click();
  }
  const response = await responsePromise;
  page.off("request", onRequest);

  if (options.requireServerActionResponse && !response) {
    throw new Error(
      `Timed out waiting for the server action response. Observed POSTs: ${
        observedPosts.join("; ") || "none"
      }`,
    );
  }

  if (response && response.status() >= 400) {
    throw new Error(`Server action returned HTTP ${response.status()}.`);
  }

  await page.waitForTimeout(Math.max(settleMs, getMinimumActionSettleMs()));

  const currentUrl = new URL(page.url());
  const actionError = currentUrl.searchParams.get("error");

  if (actionError) {
    throw new Error(actionError);
  }
}

function getMinimumActionSettleMs() {
  return (process.env.E2E_TOURNAMENT_STATE_BACKEND ?? process.env.TOURNAMENT_STATE_BACKEND) ===
    "supabase"
    ? HOSTED_SUPABASE_ACTION_SETTLE_MS
    : 0;
}
