export function buildPublicRouteUrl(path: string, siteUrl = process.env.NEXT_PUBLIC_SITE_URL) {
  const routePath = path.startsWith("/") ? path : `/${path}`;
  const trimmedSiteUrl = siteUrl?.trim().replace(/\/+$/, "");

  if (!trimmedSiteUrl) {
    return routePath;
  }

  try {
    return new URL(routePath, `${trimmedSiteUrl}/`).toString();
  } catch {
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
