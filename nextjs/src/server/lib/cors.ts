// Shared CORS headers — the prototype pages and external cabinet call the API
// cross-origin. One definition instead of copy-pasting per route.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;
