import type { Browser, Page } from "@playwright/test";
import { expectSupabaseRehearsalBallots } from "../fixtures/supabase-state";
import type {
  RehearsalBallotPlan,
  RehearsalRoundExpectation,
} from "../fixtures/rehearsal-plan";
import { VotePage } from "../pages/vote.page";

const DEFAULT_BALLOT_BATCH_SIZE = 4;
const DEFAULT_PRODUCTION_FLOW_BALLOT_CONCURRENCY = 12;
const DEFAULT_PREWARM_CONCURRENCY = 12;

export type PreparedRehearsalBallotPage = {
  page: Page;
  plan: RehearsalBallotPlan;
};

function positiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function ballotBatchSize() {
  const fallback =
    process.env.E2E_PROFILE === "production-flow"
      ? DEFAULT_PRODUCTION_FLOW_BALLOT_CONCURRENCY
      : DEFAULT_BALLOT_BATCH_SIZE;

  return positiveIntegerEnv("E2E_PRODUCTION_FLOW_BALLOT_CONCURRENCY", fallback);
}

function prewarmConcurrency() {
  return positiveIntegerEnv("E2E_PRODUCTION_FLOW_PREWARM_CONCURRENCY", DEFAULT_PREWARM_CONCURRENCY);
}

function expectedRevisionMessage() {
  return "Ballot successfully submitted.";
}

async function mapWithWorkers<TItem, TResult>(
  items: readonly TItem[],
  workerCount: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
) {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const count = Math.min(workerCount, items.length);

  await Promise.all(
    Array.from({ length: count }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= items.length) {
          return;
        }

        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
}

export async function prepareRehearsalBallotPages(options: {
  baseURL: string;
  browser: Browser;
  expectation: RehearsalRoundExpectation;
  roundNumber: number;
}) {
  const { baseURL, browser, expectation, roundNumber } = options;
  const concurrency = Math.min(prewarmConcurrency(), expectation.ballotPlans.length);

  if (expectation.ballotPlans.length === 0) {
    return [];
  }

  console.log(
    `[phase9] round ${roundNumber}: prewarm ${expectation.ballotPlans.length} voter room pages`,
  );

  return mapWithWorkers(expectation.ballotPlans, concurrency, async (plan) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const votePage = new VotePage(page, baseURL);

    try {
      await votePage.gotoRoom();

      return { page, plan };
    } catch (error) {
      await page.close().catch(() => undefined);
      throw error;
    }
  });
}

export async function closePreparedRehearsalBallotPages(
  preparedBallots: readonly PreparedRehearsalBallotPage[],
) {
  await Promise.all(preparedBallots.map(({ page }) => page.close().catch(() => undefined)));
}

async function submitPlannedBallot(options: {
  baseURL: string;
  browser: Browser;
  index: number;
  page?: Page;
  plan: RehearsalBallotPlan;
  roundNumber: number;
  total: number;
}) {
  const { baseURL, browser, index, page: preparedPage, plan, roundNumber, total } = options;
  const page = preparedPage ?? (await browser.newPage({ viewport: { width: 390, height: 844 } }));
  const votePage = new VotePage(page, baseURL);
  const startedAt = Date.now();

  try {
    const [firstRevision, ...laterRevisions] = plan.revisions;

    if (!firstRevision) {
      throw new Error(`No ballot revisions planned for ${plan.playerName}.`);
    }

    await votePage.submitBallot({
      banPlan: firstRevision.banPlan,
      expectedMessage: expectedRevisionMessage(),
      playerName: plan.playerName,
      startFromRoom: true,
      useCurrentRoom: Boolean(preparedPage),
      waitForCardsAfterConfirm: false,
    });

    for (const revision of laterRevisions) {
      await page.getByRole("button", { name: /^Edit / }).first().click();
      await votePage.finishCurrentBallot(
        revision.banPlan,
        expectedRevisionMessage(),
      );
    }

    console.log(
      `[phase9] round ${roundNumber}: voter ${index + 1}/${total} ${plan.playerName} saved in ${(
        (Date.now() - startedAt) /
        1000
      ).toFixed(1)}s`,
    );
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function submitRehearsalBallots(options: {
  baseURL: string;
  browser: Browser;
  expectation: RehearsalRoundExpectation;
  preparedBallots?: readonly PreparedRehearsalBallotPage[];
  roundNumber: number;
}) {
  const { baseURL, browser, expectation, preparedBallots, roundNumber } = options;
  const batchSize = Math.min(ballotBatchSize(), expectation.ballotPlans.length);

  if (preparedBallots && preparedBallots.length !== expectation.ballotPlans.length) {
    throw new Error(
      `Round ${roundNumber} expected ${expectation.ballotPlans.length} prepared voter pages, got ${preparedBallots.length}.`,
    );
  }

  console.log(
    `[phase9] round ${roundNumber}: submit ${expectation.submittedPlayerCount} planned UI ballots`,
  );

  await mapWithWorkers(expectation.ballotPlans, batchSize, async (plan, index) => {
    const prepared = preparedBallots?.[index];

    if (prepared && prepared.plan.playerName !== plan.playerName) {
      throw new Error(
        `Prepared voter page mismatch at index ${index}: expected ${plan.playerName}, got ${prepared.plan.playerName}.`,
      );
    }

    await submitPlannedBallot({
      baseURL,
      browser,
      index,
      page: prepared?.page,
      plan,
      roundNumber,
      total: expectation.ballotPlans.length,
    });
  });

  await expectSupabaseRehearsalBallots(roundNumber, expectation);
}
