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
