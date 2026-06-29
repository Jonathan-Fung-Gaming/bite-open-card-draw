export function isLocalEventOrigin(origin: string) {
  try {
    const url = new URL(origin);

    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

export function isAbsoluteHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isTestLocalOriginAllowed() {
  return process.env.TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL === "true";
}

export function buildPublicRouteUrl(path: string, siteUrl = process.env.NEXT_PUBLIC_SITE_URL) {
  const routePath = path.startsWith("/") ? path : `/${path}`;
  const trimmedSiteUrl = siteUrl?.trim().replace(/\/+$/, "");

  if (!trimmedSiteUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute public URL in production.");
    }

    return routePath;
  }

  try {
    const url = new URL(routePath, `${trimmedSiteUrl}/`);

    if (
      process.env.NODE_ENV === "production" &&
      (!isAbsoluteHttpUrl(trimmedSiteUrl) ||
        (isLocalEventOrigin(trimmedSiteUrl) && !isTestLocalOriginAllowed()))
    ) {
      throw new Error("NEXT_PUBLIC_SITE_URL must not be localhost in production.");
    }

    return url.toString();
  } catch {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute public URL in production.");
    }

    return routePath;
  }
}

export function formatShortEventUrl(urlOrPath: string) {
  try {
    const url = new URL(urlOrPath);
    return `${url.host}${url.pathname}${url.search}`;
  } catch {
    return urlOrPath;
  }
}
