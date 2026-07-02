import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page, TestInfo } from "@playwright/test";

export async function writeJsonEvidence(
  testInfo: TestInfo,
  filename: string,
  payload: unknown,
) {
  const path = testInfo.outputPath(filename);
  const body = `${JSON.stringify(payload, null, 2)}\n`;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
  await testInfo.attach(filename, {
    path,
    contentType: "application/json",
  });

  return path;
}

export async function captureEvidenceScreenshot(
  testInfo: TestInfo,
  filename: string,
  page: Page,
) {
  const path = testInfo.outputPath(filename);

  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ fullPage: true, path });
  await testInfo.attach(filename, {
    path,
    contentType: "image/png",
  });

  return path;
}
