let fallbackRequestSequence = 0;

function formatUuid(hexInput: string) {
  const hex = hexInput.padStart(32, "0").slice(-32).split("");

  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16] ?? "0", 16) % 4];

  const value = hex.join("");

  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function createClientRequestId() {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));

    return formatUuid(Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""));
  }

  fallbackRequestSequence += 1;
  const nowHex = Date.now().toString(16).padStart(12, "0");
  const performanceHex = Math.floor(
    (typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : 0) * 1000,
  )
    .toString(16)
    .padStart(12, "0");
  const sequenceHex = fallbackRequestSequence.toString(16).padStart(8, "0");

  return formatUuid(`${nowHex}${performanceHex}${sequenceHex}`);
}
