import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { hasMongoOperators, type UserRole } from '../../src/shared/rules.js';

const IN_MEMORY_JWT_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : IN_MEMORY_JWT_SECRET;
}

export interface JwtClaims {
  sub: string;
  role: UserRole;
  name: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: JwtClaims;
}

export function signJwt(claims: JwtClaims): string {
  return jwt.sign(claims, getJwtSecret(), { expiresIn: '12h' });
}

export function verifyJwt(token: string): JwtClaims {
  const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
  if (!decoded.sub || (decoded.role !== 'student' && decoded.role !== 'admin')) {
    throw new Error('Invalid token claims');
  }
  return {
    sub: String(decoded.sub),
    role: decoded.role,
    name: String(decoded.name || ''),
  };
}

export function rejectMongoOperators(req: Request, res: Response, next: NextFunction): void {
  if (hasMongoOperators(req.body) || hasMongoOperators(req.query)) {
    res.status(400).json({ error: 'Invalid query or payload operators detected.' });
    return;
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    req.auth = verifyJwt(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function requireRole(role: UserRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (req.auth.role !== role) {
      res.status(403).json({
        error: `Access denied. ${role === 'admin' ? 'Professor (Admin)' : 'Student'} role required.`,
      });
      return;
    }
    next();
  };
}
