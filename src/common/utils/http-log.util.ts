import type { Request } from 'express';

export function httpLogMetadata(request: Request): string {
  const method = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(
    request.method,
  )
    ? request.method
    : 'OTHER';
  const route: unknown = request.route;
  const template =
    typeof route === 'object' &&
    route !== null &&
    'path' in route &&
    typeof route.path === 'string'
      ? route.path.replace(/[\r\n\t]/g, '').slice(0, 200)
      : '[unmatched]';

  // Express route templates are server-defined; URLs, baseUrl and path can
  // contain client-controlled identifiers or credentials and must not be logged.
  return `${method} ${template}`;
}
