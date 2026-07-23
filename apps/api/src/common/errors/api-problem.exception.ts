import { HttpException } from '@nestjs/common';
import type { ValidationError } from '@pitstop/contracts';

export interface ApiProblemOptions {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly validationErrors?: readonly ValidationError[];
}

export class ApiProblemException extends HttpException {
  constructor(options: ApiProblemOptions) {
    super(
      {
        code: options.code,
        title: options.title,
        message: options.detail,
        ...(options.validationErrors
          ? { details: { validationErrors: options.validationErrors } }
          : {}),
      },
      options.status,
    );
  }
}
