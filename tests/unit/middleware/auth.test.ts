import { Request, Response, NextFunction } from 'express';
import {
  authenticateApiKey,
  authenticateJWT,
  authenticate,
  authorize,
  authService,
  AuthRequest,
} from '../../../src/middleware/auth';

describe('Auth Middleware', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe('authenticateApiKey', () => {
    it('should authenticate valid API key', () => {
      const { key } = authService.generateApiKey('test', 'user', ['read']);
      mockReq.headers = { 'x-api-key': key };

      authenticateApiKey(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.role).toBe('user');
    });

    it('should reject missing API key', () => {
      authenticateApiKey(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'API key required',
        })
      );
    });

    it('should reject invalid API key', () => {
      mockReq.headers = { 'x-api-key': 'invalid-key' };

      authenticateApiKey(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid API key',
        })
      );
    });
  });

  describe('authenticateJWT', () => {
    it('should authenticate valid JWT token', () => {
      const token = authService.generateJWT({
        id: 'user-1',
        role: 'user',
        scopes: ['read'],
      });
      mockReq.headers = { authorization: `Bearer ${token}` };

      authenticateJWT(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.id).toBe('user-1');
    });

    it('should reject missing token', () => {
      authenticateJWT(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Bearer token required',
        })
      );
    });

    it('should reject invalid token', () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };

      authenticateJWT(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid or expired token',
        })
      );
    });
  });

  describe('authenticate', () => {
    it('should accept either API key or JWT', () => {
      const { key } = authService.generateApiKey('test', 'user', ['read']);
      
      // Test with API key
      mockReq.headers = { 'x-api-key': key };
      authenticate()(mockReq as AuthRequest, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledWith();

      // Reset
      mockNext.mockClear();
      mockReq.user = undefined;

      // Test with JWT
      const token = authService.generateJWT({ id: 'user-1', role: 'user', scopes: ['read'] });
      mockReq.headers = { authorization: `Bearer ${token}` };
      authenticate()(mockReq as AuthRequest, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should enforce specific authentication type', () => {
      const { key } = authService.generateApiKey('test', 'user', ['read']);
      mockReq.headers = { 'x-api-key': key };

      // Should fail when JWT is required
      authenticate('jwt')(mockReq as AuthRequest, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Bearer token required',
        })
      );
    });
  });

  describe('authorize', () => {
    it('should allow access with required scopes', () => {
      mockReq.user = {
        id: 'user-1',
        role: 'user',
        scopes: ['read', 'write'],
      };

      authorize(['read'])(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow admin access regardless of scopes', () => {
      mockReq.user = {
        id: 'admin-1',
        role: 'admin',
        scopes: [],
      };

      authorize(['read', 'write', 'delete'])(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access without required scopes', () => {
      mockReq.user = {
        id: 'user-1',
        role: 'user',
        scopes: ['read'],
      };

      authorize(['write', 'delete'])(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Insufficient permissions'),
        })
      );
    });

    it('should handle wildcard scope', () => {
      mockReq.user = {
        id: 'user-1',
        role: 'user',
        scopes: ['*'],
      };

      authorize(['read', 'write', 'delete'])(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});