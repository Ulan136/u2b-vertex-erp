// Typed application errors. Services throw these; the http layer maps them
// to HTTP status codes. Keeps controllers free of status-code logic.
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message = 'Bad request') => new ApiError(400, message);
export const forbidden = (message = 'Нет доступа') => new ApiError(403, message);
export const notFound = (message = 'Not found') => new ApiError(404, message);
export const conflict = (message = 'Conflict') => new ApiError(409, message);
