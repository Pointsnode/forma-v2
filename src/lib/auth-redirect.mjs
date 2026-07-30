// Where the middleware sends an unauthenticated request. Preserves the locale
// prefix so the bounce lands in the same language. localePrefix "as-needed":
// the default locale is unprefixed, every other locale carries /<locale>.
//   /es, /es/anything -> /es/sign-in
//   /, /anything      -> /sign-in
// Pure and dependency-free so test:logic can exercise it directly.
export function signInRedirectPath(pathname, locales, defaultLocale) {
  const prefix = locales.find(
    (l) => l !== defaultLocale && (pathname === `/${l}` || pathname.startsWith(`/${l}/`)),
  );
  return prefix ? `/${prefix}/sign-in` : "/sign-in";
}

// The `?next=` post-sign-in destination, validated to a same-origin RELATIVE path so it
// can never become an open redirect. Accept only a single leading slash (`^/(?!/)` blocks
// protocol-relative `//evil.com`), no backslashes (some browsers fold `\` to `/`), no
// whitespace/control chars (header-injection / smuggling), and a sane length. Anything
// else → null, and the caller falls back to the cockpit ("/"). Store an UNPREFIXED path
// (e.g. /join/team/<token>); i18n redirect() re-applies the locale prefix. Pure so
// test:logic can exercise it directly, like signInRedirectPath.
export function safeNextPath(next) {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return null;
  if (!/^\/(?!\/)/.test(next)) return null; // must start with exactly one slash
  if (/[\\\s]/.test(next)) return null; // no backslashes, no whitespace/newlines
  return next;
}
