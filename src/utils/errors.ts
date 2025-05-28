export class BaseError extends Error {
  constructor(
    public message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIG_ERROR', 500, details);
  }
}

export class RepositoryError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'REPOSITORY_ERROR', 500, details);
  }
}

export class DocumentProcessingError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'DOCUMENT_PROCESSING_ERROR', 500, details);
  }
}

export class EmbeddingError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'EMBEDDING_ERROR', 500, details);
  }
}

export class VectorStoreError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'VECTOR_STORE_ERROR', 500, details);
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'AUTH_ERROR', 401, details);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'NOT_FOUND', 404, details);
  }
}

export function isOperationalError(error: Error): boolean {
  if (error instanceof BaseError) {
    return true;
  }
  return false;
}

export function handleError(error: Error): void {
  if (!isOperationalError(error)) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}