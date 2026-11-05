/** An error the client is meant to see. Anything else becomes a plain 500. */
export class ApiError extends Error {
  readonly status: 400 | 401 | 404 | 409 | 422;
  readonly code: string;

  constructor(status: ApiError['status'], code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
