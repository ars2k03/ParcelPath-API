export type ErrorDetail = {
  path: string;
  message: string;
};

export class AppError extends Error {
  readonly statusCode: number;
  readonly errors: ErrorDetail[];

  constructor(statusCode: number, message: string, errors: ErrorDetail[] = []) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
