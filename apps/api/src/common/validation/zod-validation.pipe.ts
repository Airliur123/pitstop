import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ValidationError } from '@pitstop/contracts';
import type { ZodType } from 'zod';

import { ApiProblemException } from '../errors/api-problem.exception';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const validationErrors: ValidationError[] = result.error.issues.map((issue) => ({
      field: issue.path.map(String).join('.') || 'request',
      message: issue.message,
    }));
    const code = validationCode(validationErrors);
    throw new ApiProblemException({
      status: 400,
      code,
      title: 'Invalid request',
      detail: 'One or more request values are invalid.',
      validationErrors,
    });
  }
}

function validationCode(errors: readonly ValidationError[]): string {
  const fields = new Set(errors.map((error) => error.field));
  if (fields.has('latitude') || fields.has('longitude')) return 'INVALID_COORDINATE';
  if (fields.has('radiusMeters')) return 'INVALID_RADIUS';
  if (fields.has('budgetAmount')) return 'INVALID_BUDGET';
  if (fields.has('cursor')) return 'INVALID_CURSOR';
  return 'VALIDATION_ERROR';
}
