import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

interface PrismaKnownError {
  code: string;
  meta?: Record<string, unknown>;
}

// Duck-typed on purpose instead of `instanceof Prisma.PrismaClientKnownRequestError`
// — avoids a static dependency on a class the generated client only exports
// after `prisma generate` has run, and Prisma's error codes (P2002, P2003, ...)
// are a stable public contract either way.
function isPrismaKnownError(err: unknown): err is PrismaKnownError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof err.code === 'string' &&
    /^P\d{4}$/.test((err as { code: string }).code)
  );
}

/**
 * Services call `throw toHttpException(err, 'Product')` around Prisma writes.
 * Keeps controllers from ever leaking a raw Postgres/Prisma error message,
 * and gives every catalog resource the same error shape for the same
 * underlying DB constraint violation.
 */
export function toHttpException(err: unknown, resource = 'Record'): Error {
  if (isPrismaKnownError(err)) {
    switch (err.code) {
      case 'P2002': {
        // Unique constraint violation — e.g. duplicate SKU, duplicate brand name.
        const target = (err.meta?.target as string[] | undefined)?.join(', ');
        return new ConflictException(
          target
            ? `${resource} with this ${target} already exists.`
            : `${resource} already exists.`,
        );
      }
      case 'P2003':
        // Foreign key violation — either the reference target doesn't exist
        // (create/update pointing at a bad id) or a delete was blocked
        // because something still references this row.
        return new ConflictException(
          `${resource} operation failed: a related record is missing or still in use.`,
        );
      case 'P2025':
        return new NotFoundException(`${resource} not found.`);
      default:
        return new BadRequestException(
          `${resource} operation failed (${err.code}).`,
        );
    }
  }
  return err instanceof Error
    ? err
    : new BadRequestException('Unexpected error.');
}
