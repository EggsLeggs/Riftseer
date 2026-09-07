/**
 * The routes anyone may call: no account, any origin.
 *
 * One list drives two things. The CORS plugin answers `*` only for a route
 * named here, and `route-security.test.ts` requires every other mounted route
 * to carry an auth guard (or to be one of the session endpoints it names
 * itself). Adding a route here is therefore a deliberate statement that it is
 * public — exact method and Elysia path, one per line.
 */
export const PUBLIC_ROUTES = [
  "GET /docs",
  "GET /api/v1/openapi.json",
  "GET /api/v1/health",
  "GET /api/v1/meta",
  "GET /api/v1/cards",
  "GET /api/v1/cards/random",
  "GET /api/v1/cards/detail",
  "GET /api/v1/cards/:id",
  "GET /api/v1/cards/:id/text",
  "GET /api/v1/cards/by-slug/*",
  "POST /api/v1/cards/resolve",
  "GET /api/v1/printings/:id",
  "GET /api/v1/sets",
  "GET /api/v1/formats",
  // Public and unlisted deck reads; a deck the caller may not read is a 404.
  "GET /api/v1/decks",
  "GET /api/v1/decks/:id",
  "GET /api/v1/decks/:id/comments",
  "GET /api/v1/decks/:id/export",
  "GET /api/v1/decks/:id/revisions",
  // Anonymous view counting from the deck page.
  "POST /api/v1/decks/:id/views",
  "GET /api/v1/users/:handle",
  "GET /api/v1/users/:handle/followers",
  "GET /api/v1/users/:handle/following",
] as const;

interface CompiledRoute {
  method: string;
  pattern: RegExp;
}

function compile(route: string): CompiledRoute {
  const [method, path] = route.split(" ");
  const source = path
    .split("/")
    .map((segment) => {
      if (segment === "*") return ".*";
      if (segment.startsWith(":")) return "[^/]+";
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { method, pattern: new RegExp(`^${source}$`) };
}

/**
 * Turns `"METHOD /elysia/:path/*"` strings into a request-time predicate.
 * HEAD reads like GET; nothing else is normalised.
 */
export function compileRouteMatcher(
  routes: readonly string[],
): (method: string, pathname: string) => boolean {
  const compiled = routes.map(compile);
  return (method, pathname) => {
    const wanted = method === "HEAD" ? "GET" : method.toUpperCase();
    return compiled.some((route) => route.method === wanted && route.pattern.test(pathname));
  };
}

export const isPublicRoute = compileRouteMatcher(PUBLIC_ROUTES);
