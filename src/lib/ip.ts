/**
 * Resolves the client IP from proxy headers.
 *
 * X-Forwarded-For is client-controllable: a caller can send `X-Forwarded-For: 1.2.3.4` and each
 * proxy on the way appends the address it saw. Trusting the *left-most* entry (as this file once
 * did) lets anyone dodge every per-IP rate limit by rotating a fake header. Instead we count
 * TRUSTED_PROXY_HOPS entries in from the *right*, i.e. the address our own infrastructure saw.
 *
 * TRUSTED_PROXY_HOPS is the number of proxies you operate in front of the app (default 1; Vercel
 * and most single-load-balancer setups). Set it to 0 to ignore forwarding headers entirely.
 */
export function getClientIp(request: Request): string | null {
  const hops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
  const trustedHops = Number.isNaN(hops) || hops < 0 ? 1 : hops;

  if (trustedHops > 0) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const ips = forwardedFor.split(",").map((ip) => ip.trim()).filter(Boolean);
      const picked = ips[Math.max(ips.length - trustedHops, 0)];
      if (picked) return picked;
    }

    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }

  // `next dev` sets no forwarding headers. Outside production fall back to loopback so local
  // development works; in production an unresolvable IP is rejected (fail closed).
  return process.env.NODE_ENV === "production" ? null : "127.0.0.1";
}
