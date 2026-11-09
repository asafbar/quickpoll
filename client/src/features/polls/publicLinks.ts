export function presentationPath(joinCode: string) {
  return "/present?" + new URLSearchParams({ code: joinCode }).toString();
}

export function buildPublicJoinLink(joinCode: string, browserOrigin: string, configuredUrl?: string, joinPath: "/join" | "/sessions/join" = "/join") {
  let origin = browserOrigin;
  let invalidConfiguration = false;

  if (configuredUrl?.trim()) {
    try {
      const configured = new URL(configuredUrl.trim());
      if (!["http:", "https:"].includes(configured.protocol) || configured.username || configured.password ||
          configured.pathname !== "/" || configured.search || configured.hash) {
        throw new Error("Expected an HTTP(S) origin");
      }
      origin = configured.origin;
    } catch {
      invalidConfiguration = true;
    }
  }

  const url = new URL(joinPath, origin);
  url.searchParams.set("code", joinCode);
  const host = url.hostname.replace(/\.$/, "");
  const localOnly = host === "localhost" || host.endsWith(".localhost") || /^127(?:\.\d{1,3}){3}$/.test(host) ||
    host === "0.0.0.0" || host === "[::1]" || host === "[::]";

  return { href: url.href, invalidConfiguration, localOnly };
}

export function getPublicJoinLink(joinCode: string, joinPath?: "/join" | "/sessions/join") {
  return buildPublicJoinLink(joinCode, window.location.origin, import.meta.env.VITE_PUBLIC_APP_URL, joinPath);
}
