import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TestInfo } from "@playwright/test";

export const PROHIBITED_DIAGNOSTIC_KEY_PARTS = [
  "apikey",
  "authorization",
  "authheader",
  "cookie",
  "header",
  "hostcredential",
  "hosttoken",
  "html",
  "password",
  "passwd",
  "passphrase",
  "playername",
  "requestbody",
  "responsebody",
  "secret",
  "servicekey",
  "servicerole",
  "session",
  "startgg",
  "token",
  "username",
] as const;

export const PROHIBITED_DIAGNOSTIC_EXACT_KEYS = new Set([
  "body",
  "consoleargs",
  "hash",
  "pwd",
  "rawbody",
  "responsehtml",
]);

const ALLOWED_CONTAINER_KEYS = new Set([
  "after",
  "afterReroll",
  "afterRestart",
  "afterStageConfirmation",
  "before",
  "beforeReroll",
  "countdown",
  "container",
  "diagnostics",
  "draw",
  "draws",
  "document",
  "earliest",
  "failure",
  "failures",
  "geometry",
  "hostRecovery",
  "image",
  "logo",
  "loaded",
  "metrics",
  "requests",
  "publicErrors",
  "publicResponses",
  "revealPhases",
  "result",
  "roster",
  "routes",
  "samples",
  "state",
  "settled",
  "timing",
  "transitions",
  "viewport",
  "voting",
]);

const ALLOWED_NUMBER_KEYS = new Set([
  "actionCount",
  "activeCount",
  "activePlayerCount",
  "bottom",
  "clientHeight",
  "clientWidth",
  "confirmationLatencyMs",
  "confirmedActionCount",
  "countdownSkewMs",
  "drawVersion",
  "durationMs",
  "elapsedMs",
  "fontSizePx",
  "fontSize",
  "freshnessGeneration",
  "height",
  "horizontalOverflowPx",
  "httpStatus",
  "inactivePlayerCount",
  "latencyMs",
  "layoutShiftValue",
  "layoutShiftCount",
  "left",
  "p50Ms",
  "p95Ms",
  "phoneSeconds",
  "propagationLatencyMs",
  "propagationMs",
  "right",
  "roundNumber",
  "scrollHeight",
  "scrollWidth",
  "sequence",
  "stageSeconds",
  "status",
  "skewSeconds",
  "timingMs",
  "timingSampleMs",
  "top",
  "totalPlayerCount",
  "totalMs",
  "viewportHeight",
  "viewportWidth",
  "width",
  "workflowDurationMs",
  "x",
  "y",
]);

const ALLOWED_NUMBER_ARRAY_KEYS = new Set([
  "confirmationLatenciesMs",
  "drawVersions",
  "latenciesMs",
  "timingSamplesMs",
]);

const ALLOWED_BOOLEAN_KEYS = new Set([
  "collectionSucceeded",
  "eventIdDiffersFromConfigured",
  "hasHorizontalOverflow",
  "horizontalOverflow",
  "imageLoaded",
  "isDisposableEvent",
  "observed",
  "productionEventDiffers",
  "controlAfterAging",
  "recoverySucceeded",
]);

const ALLOWED_IDENTIFIER_KEYS = new Set([
  "appearance",
  "digest",
  "drawId",
  "drawStatus",
  "errorClass",
  "resultId",
  "resultPhase",
  "observationPhase",
  "rscDigest",
  "tagName",
  "votingStatus",
]);

const ALLOWED_IDENTIFIER_ARRAY_KEYS = new Set(["drawIds"]);
const ALLOWED_PATH_KEYS = new Set(["path", "route"]);
const ALLOWED_METHOD_KEYS = new Set(["httpMethod", "method"]);
const ALLOWED_TIMESTAMP_KEYS = new Set([
  "deadline",
  "freshnessObservedAt",
  "observedAt",
  "votingDeadline",
]);
const ALLOWED_EVENT_PREFIX_KEYS = new Set(["eventIdPrefix"]);

const NULLABLE_CONTAINER_KEYS = new Set(["geometry"]);
const NULLABLE_NUMBER_KEYS = new Set([
  "bottom",
  "clientHeight",
  "clientWidth",
  "freshnessGeneration",
  "height",
  "left",
  "phoneSeconds",
  "right",
  "scrollHeight",
  "scrollWidth",
  "skewSeconds",
  "stageSeconds",
  "top",
  "viewportHeight",
  "viewportWidth",
  "width",
  "x",
  "y",
]);
const NULLABLE_IDENTIFIER_KEYS = new Set(["digest", "resultId", "resultPhase", "votingStatus"]);
const NULLABLE_TIMESTAMP_KEYS = new Set(["deadline", "freshnessObservedAt"]);

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_ROUTE_PATTERN = /^\/[A-Za-z0-9/_-]*$/;
const SAFE_HTTP_METHODS = new Set(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);

export const PROHIBITED_DIAGNOSTIC_VALUE_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "authorization value", pattern: /\b(?:basic|bearer)\s+[A-Za-z0-9._~+/=-]+/i },
  { label: "cookie value", pattern: /\b(?:cookie|set-cookie)\s*:/i },
  {
    label: "credential assignment",
    pattern:
      /\b(?:password|passwd|pwd|secret|service[_ -]?role|session[_ -]?token|host[_ -]?token|authorization)\s*[:=]/i,
  },
  { label: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]+\b/i },
  { label: "JWT", pattern: /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { label: "password hash", pattern: /(?:\$2[aby]\$\d{2}\$|\$argon2(?:id|i|d)\$|\$scrypt\$)/i },
  { label: "hex hash", pattern: /\b[a-f0-9]{64,128}\b/i },
  { label: "HTML", pattern: /<!doctype\s+html|<html(?:\s|>)|<body(?:\s|>)|<script(?:\s|>)/i },
  {
    label: "serialized sensitive field",
    pattern: /["'](?:username|password|cookie|authorization|sessionToken|hostToken)["']\s*:/i,
  },
  { label: "serialized body", pattern: /^\s*[\[{]/ },
];

type JsonPrimitive = boolean | number | string | null;
export type Phase0EvidenceValue =
  JsonPrimitive | Phase0EvidenceValue[] | { [key: string]: Phase0EvidenceValue };

export class Phase0EvidenceSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Phase0EvidenceSafetyError";
  }
}

function normalizeKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function assertSafeKey(key: string, path: string) {
  const normalizedKey = normalizeKey(key);
  const prohibitedPart = PROHIBITED_DIAGNOSTIC_KEY_PARTS.find((part) =>
    normalizedKey.includes(part),
  );

  if (
    PROHIBITED_DIAGNOSTIC_EXACT_KEYS.has(normalizedKey) ||
    normalizedKey.endsWith("hash") ||
    prohibitedPart
  ) {
    throw new Phase0EvidenceSafetyError(`Prohibited evidence key at ${path}.${key}.`);
  }
}

function assertSafeString(value: string, path: string) {
  const match = PROHIBITED_DIAGNOSTIC_VALUE_PATTERNS.find(({ pattern }) => pattern.test(value));

  if (match) {
    throw new Phase0EvidenceSafetyError(`Prohibited ${match.label} at ${path}.`);
  }
}

function assertJsonSafeInput(value: unknown, path: string, ancestors: Set<object>) {
  if (typeof value === "string") {
    assertSafeString(value, path);
    return;
  }

  if (value === null || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Phase0EvidenceSafetyError(`Non-finite number at ${path}.`);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new Phase0EvidenceSafetyError(`Unsupported evidence value at ${path}.`);
  }

  if (ancestors.has(value)) {
    throw new Phase0EvidenceSafetyError(`Circular evidence value at ${path}.`);
  }

  const nextAncestors = new Set(ancestors).add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafeInput(item, `${path}[${index}]`, nextAncestors));
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Phase0EvidenceSafetyError(`Non-plain evidence object at ${path}.`);
  }

  for (const [key, child] of Object.entries(value)) {
    assertSafeKey(key, path);
    assertJsonSafeInput(child, `${path}.${key}`, nextAncestors);
  }
}

function expectNumber(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Phase0EvidenceSafetyError(`Expected a finite number at ${path}.`);
  }
  return value;
}

function expectBoolean(value: unknown, path: string) {
  if (typeof value !== "boolean") {
    throw new Phase0EvidenceSafetyError(`Expected a boolean at ${path}.`);
  }
  return value;
}

function expectIdentifier(value: unknown, path: string) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new Phase0EvidenceSafetyError(`Expected a safe diagnostic identifier at ${path}.`);
  }
  return value;
}

function expectRoute(value: unknown, path: string) {
  if (typeof value !== "string" || !SAFE_ROUTE_PATTERN.test(value)) {
    throw new Phase0EvidenceSafetyError(`Expected a query-free route path at ${path}.`);
  }
  return value;
}

function expectMethod(value: unknown, path: string) {
  if (typeof value !== "string" || !SAFE_HTTP_METHODS.has(value)) {
    throw new Phase0EvidenceSafetyError(`Expected an uppercase HTTP method at ${path}.`);
  }
  return value;
}

function expectTimestamp(value: unknown, path: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Phase0EvidenceSafetyError(`Expected an ISO UTC timestamp at ${path}.`);
  }
  return value;
}

function expectDisposableEventPrefix(value: unknown, path: string) {
  if (value !== "phase0-") {
    throw new Phase0EvidenceSafetyError(`Expected only the disposable phase0- prefix at ${path}.`);
  }
  return value;
}

function nullable(
  value: unknown,
  path: string,
  sanitizer: (value: unknown, path: string) => Phase0EvidenceValue,
) {
  return value === null ? null : sanitizer(value, path);
}

function sanitizeArray(
  value: unknown,
  path: string,
  itemSanitizer: (item: unknown, path: string) => Phase0EvidenceValue,
) {
  if (!Array.isArray(value)) {
    throw new Phase0EvidenceSafetyError(`Expected an array at ${path}.`);
  }

  return value.map((item, index) => itemSanitizer(item, `${path}[${index}]`));
}

function sanitizeContainer(value: unknown, path: string): Phase0EvidenceValue {
  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeContainer(item, `${path}[${index}]`));
  }

  if (typeof value !== "object") {
    throw new Phase0EvidenceSafetyError(`Expected an evidence object or array at ${path}.`);
  }

  return sanitizeRecord(value as Record<string, unknown>, path);
}

function sanitizeRecord(value: Record<string, unknown>, path: string) {
  const sanitized: Record<string, Phase0EvidenceValue> = {};

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;

    if (NULLABLE_CONTAINER_KEYS.has(key)) {
      sanitized[key] = nullable(child, childPath, sanitizeContainer);
    } else if (ALLOWED_CONTAINER_KEYS.has(key)) {
      sanitized[key] = sanitizeContainer(child, childPath);
    } else if (NULLABLE_NUMBER_KEYS.has(key)) {
      sanitized[key] = nullable(child, childPath, expectNumber);
    } else if (ALLOWED_NUMBER_KEYS.has(key)) {
      sanitized[key] = expectNumber(child, childPath);
    } else if (ALLOWED_NUMBER_ARRAY_KEYS.has(key)) {
      sanitized[key] = sanitizeArray(child, childPath, expectNumber);
    } else if (ALLOWED_BOOLEAN_KEYS.has(key)) {
      sanitized[key] = expectBoolean(child, childPath);
    } else if (NULLABLE_IDENTIFIER_KEYS.has(key)) {
      sanitized[key] = nullable(child, childPath, expectIdentifier);
    } else if (ALLOWED_IDENTIFIER_KEYS.has(key)) {
      sanitized[key] = expectIdentifier(child, childPath);
    } else if (ALLOWED_IDENTIFIER_ARRAY_KEYS.has(key)) {
      sanitized[key] = sanitizeArray(child, childPath, expectIdentifier);
    } else if (ALLOWED_PATH_KEYS.has(key)) {
      sanitized[key] = expectRoute(child, childPath);
    } else if (ALLOWED_METHOD_KEYS.has(key)) {
      sanitized[key] = expectMethod(child, childPath);
    } else if (NULLABLE_TIMESTAMP_KEYS.has(key)) {
      sanitized[key] = nullable(child, childPath, expectTimestamp);
    } else if (ALLOWED_TIMESTAMP_KEYS.has(key)) {
      sanitized[key] = expectTimestamp(child, childPath);
    } else if (ALLOWED_EVENT_PREFIX_KEYS.has(key)) {
      sanitized[key] = expectDisposableEventPrefix(child, childPath);
    }
  }

  return sanitized;
}

/**
 * Produces a JSON-safe Phase 0 diagnostic artifact.
 *
 * The input is scanned before filtering, so sensitive material is rejected even when it is under
 * a non-allowlisted key. Harmless non-allowlisted fields are omitted from the returned object.
 */
export function sanitizePhase0Evidence(input: unknown): Phase0EvidenceValue {
  assertJsonSafeInput(input, "$", new Set());

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Phase0EvidenceSafetyError("Phase 0 evidence must be a JSON object.");
  }

  return sanitizeRecord(input as Record<string, unknown>, "$.root");
}

type DiagnosticEvidenceTestInfo = Pick<TestInfo, "attach" | "outputPath">;

export function assertSafeDiagnosticEvidence(payload: unknown): Phase0EvidenceValue {
  return sanitizePhase0Evidence(payload);
}

export async function writeSafeDiagnosticEvidence(
  testInfo: DiagnosticEvidenceTestInfo,
  filename: string,
  payload: unknown,
) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(filename)) {
    throw new Error("Diagnostic evidence filename must be a path-free .json filename.");
  }

  const sanitized = assertSafeDiagnosticEvidence(payload);
  const path = testInfo.outputPath(filename);
  const body = `${JSON.stringify(sanitized, null, 2)}\n`;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
  await testInfo.attach(filename, {
    path,
    contentType: "application/json",
  });

  return path;
}
