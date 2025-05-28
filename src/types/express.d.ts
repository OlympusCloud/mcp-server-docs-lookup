import { Request as ExpressRequest } from 'express';
import { User } from './auth';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      auth?: {
        userId: string;
        apiKeyId?: string;
        scopes?: string[];
      };
    }
  }
}

export interface AuthRequest extends ExpressRequest {
  user?: User;
  auth?: {
    userId: string;
    apiKeyId?: string;
    scopes?: string[];
  };
}