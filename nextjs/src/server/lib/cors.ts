// The app, API and client cabinets are all served from the same origin, so no
// permissive cross-origin headers are exposed (removed the previous `*`).
// Kept as an empty map so response helpers stay unchanged.
export const CORS_HEADERS: Record<string, string> = {};
