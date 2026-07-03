import { validateReleaseDataArtifacts } from "../src/lib/charts/release-data-gate";
import {
  printRealChartImageVerification,
  verifyRealChartImages,
} from "./verify-real-chart-images";

try {
  const releaseData = validateReleaseDataArtifacts();
  const imageData = verifyRealChartImages();

  console.log(
    `Release data gate passed for ${releaseData.importedCharts} charts from ${releaseData.sourceCsvPath} (${releaseData.sourceCsvSha256}).`,
  );
  console.log(
    `Import report ${releaseData.importReportPath} (${releaseData.importReportSha256}); strictClean=${releaseData.strictClean}; signedDiagnostics=${releaseData.signedDiagnostics}; repaired=${releaseData.repairedRowCount}; skipped=${releaseData.skippedRowCount}.`,
  );
  console.log(
    `Imported chart catalog ${releaseData.importedChartCatalogPath} (${releaseData.importedChartCatalogSha256}); runtime catalog ${releaseData.runtimeCatalogPath} (${releaseData.runtimeCatalogSha256}); image manifest ${releaseData.imageAssetManifestPath} (${releaseData.imageAssetManifestSha256}).`,
  );
  printRealChartImageVerification(imageData);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
