---
name: express-middleware-patterns
description: Express.js middleware patterns for authentication, authorization, security, validation, and request handling.
origin: Express.js best practices
---

# Express Middleware Patterns

This skill covers middleware architecture patterns for Express APIs including security, authentication, validation, and request handling.

## When to Use

Use these patterns when:
- **Securing routes** - Authentication, authorization, CSRF protection
- **Validating input** - Request body, query parameters, URL params
- **Handling errors** - Centralized error handling and logging
- **Adding security headers** - Helmet, CORS, XSS protection
- **Rate limiting** - Preventing abuse and DDoS
- **Logging requests** - Audit trails and debugging

## Middleware Stack Architecture

```typescript
// index.ts - Middleware application order
app.use(helmet());           // 1. Security headers
app.use(cors(corsConfig));   // 2. CORS handling
app.use(express.json());     // 3. Body parsing
app.use(requestLogger);      // 4. Request logging
app.use(rateLimiter);        // 5. Rate limiting
app.use(csrfProtection);     // 6. CSRF protection
app.use('/api', routes);     // 7. Routes
app.use(errorHandler);       // 8. Error handling (last)
```

## Authentication Middleware

### JWT Verification with JWKS

```typescript
// middleware/auth.ts
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const ALLOWED_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'];

/**
 * Extract JWT from Authorization header or cookie
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  const cookieToken = req.cookies?.['access-token'];
  if (cookieToken) {
    return cookieToken;
  }
  
  return null;
}

/**
 * Main authentication middleware
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  
  if (!token) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
    return;
  }
  
  try {
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ALLOWED_ALGORITHMS as jwt.Algorithm[],
    });
    
    // Attach user to request
    req.user = decoded as AuthUser;
    next();
  } catch (error) {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired token'
    });
  }
}

/**
 * Optional authentication - continues even if no token
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  
  if (!token) {
    next();
    return;
  }
  
  try {
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ALLOWED_ALGORITHMS as jwt.Algorithm[],
    });
    req.user = decoded as AuthUser;
  } catch {
    // Continue without user
  }
  
  next();
}
```

### Role-Based Access Control

```typescript
import type { UserRole } from '@prisma/client';

/**
 * Require specific user roles
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
      return;
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Unauthorized role access attempt', {
        userId: req.user.id,
        requiredRoles: allowedRoles,
        userRole: req.user.role,
        path: req.path
      });
      
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions'
      });
      return;
    }
    
    next();
  };
}

// Usage
router.post('/admin/users', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), createUser);
```

### Subscription Tier Check

```typescript
/**
 * Require specific subscription tier
 */
export function requireSubscription(...allowedTiers: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
      return;
    }
    
    const userTier = req.user.subscriptionTier ?? 'FREE';
    
    const tierRank: Record<string, number> = {
      FREE: 1,
      PRO: 2,
      ULTIMATE: 3,
      ENTERPRISE: 4
    };
    
    const userRank = tierRank[userTier] ?? 0;
    const requiredRank = Math.min(...allowedTiers.map(t => tierRank[t] ?? 0));
    
    if (userRank < requiredRank) {
      res.status(403).json({
        error: 'SUBSCRIPTION_REQUIRED',
        message: 'This feature requires a higher subscription tier',
        requiredTier: allowedTiers[0]
      });
      return;
    }
    
    next();
  };
}
```

## Input Validation Middleware

### Request Body Validation

```typescript
// middleware/validation.ts
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';

type ValidationSchema = z.ZodType<unknown>;

export function validateBody(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }
    
    // Replace body with parsed data (transforms applied)
    req.body = result.data;
    next();
  };
}

// Usage
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150).optional()
});

router.post('/users', validateBody(createUserSchema), createUser);
```

### Query Parameter Validation

```typescript
export function validateQuery(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    
    if (!result.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: result.error.errors
      });
      return;
    }
    
    req.query = result.data as Record<string, unknown>;
    next();
  };
}

// Usage
const searchSchema = z.object({
  q: z.string().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

router.get('/search', validateQuery(searchSchema), searchController);
```

### UUID Parameter Validation

```typescript
import { isValidUUID } from '../utils/validation.js';

/**
 * Validate UUID parameters
 */
export function validateUUID(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];
    
    for (const param of paramNames) {
      const value = req.params[param];
      if (value && !isValidUUID(value)) {
        errors.push(`${param} must be a valid UUID`);
      }
    }
    
    if (errors.length > 0) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid parameters',
        details: errors
      });
      return;
    }
    
    next();
  };
}

// Usage
router.get('/courses/:courseId', validateUUID('courseId'), getCourse);
```

## Security Middleware

### CSRF Protection

```typescript
// middleware/csrf.ts
import csrf from 'csurf';

export const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// Error handler for CSRF token errors
export function handleCSRFError(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }
  
  res.status(403).json({
    error: 'CSRF_ERROR',
    message: 'Invalid or missing CSRF token'
  });
}
```

### XSS Protection

```typescript
// middleware/xssProtection.ts
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'];

/**
 * Sanitize string values in request body
 */
export function sanitizeBody(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return DOMPurify.sanitize(obj, { ALLOWED_TAGS });
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}
```

### Security Headers (Helmet)

```typescript
// middleware/security.ts
import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.FRONTEND_URL || ''],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});
```

## Rate Limiting

### General Rate Limiter

```typescript
// middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key generator (by user ID if authenticated, else IP)
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous'
});
```

### Strict Rate Limiter (for expensive operations)

```typescript
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many requests for this operation'
  }
});

// Usage for search
router.get('/search', strictLimiter, searchController);
```

### Authentication Rate Limiter

```typescript
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true, // Don't count successful logins
  message: {
    error: 'TOO_MANY_ATTEMPTS',
    message: 'Too many login attempts. Please try again later.'
  }
});

// Usage
router.post('/auth/login', authLimiter, loginController);
```

## Error Handling

### Centralized Error Handler

```typescript
// middleware/errorHandler.ts
import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Log error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });
  
  // Handle known error types
  if (err.name === 'ValidationError') {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.message
    });
    return;
  }
  
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
    return;
  }
  
  if (err.code === 'EBADCSRFTOKEN') {
    res.status(403).json({
      error: 'CSRF_ERROR',
      message: 'Invalid CSRF token'
    });
    return;
  }
  
  // Default: 500 Internal Server Error
  // Don't leak error details in production
  const isDev = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    ...(isDev && { details: err.message, stack: err.stack })
  });
};
```

### Async Handler Wrapper

```typescript
import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * Wrap async route handlers to catch errors
 */
export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Usage
router.get(
  '/courses',
  asyncHandler(async (req, res) => {
    const courses = await courseService.findAll();
    res.json({ data: courses });
  })
);
```

## Request Logging

### Structured Request Logger

```typescript
// middleware/requestLogger.ts
import { randomUUID } from 'crypto';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.requestId = requestId as string;
  
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  
  next();
}
```

## CORS Configuration

```typescript
// middleware/cors.ts
import cors from 'cors';

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  process.env.STAGING_URL,
].filter(Boolean);

export const corsConfig = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
});
```

## Complete Route Example

```typescript
import { Router } from 'express';
import { z } from 'zod';
import {
  requireAuth,
  requireRole,
  requireSubscription,
  validateBody,
  validateUUID,
  asyncHandler,
  strictLimiter
} from '../middleware/index.js';

const router = Router();

const createCourseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  category: z.enum(['PROGRAMMING', 'DESIGN', 'BUSINESS']),
  isPublic: z.boolean().default(false)
});

// Protected route with multiple middleware
router.post(
  '/courses',
  requireAuth,                                    // 1. Must be authenticated
  requireSubscription('PRO', 'ULTIMATE'),         // 2. Must have paid plan
  validateBody(createCourseSchema),               // 3. Validate input
  asyncHandler(async (req, res) => {
    const course = await courseService.create({
      ...req.body,
      creatorId: req.user!.id
    });
    
    res.status(201).json({ data: course });
  })
);

// Admin-only route with UUID validation
router.delete(
  '/courses/:courseId',
  requireAuth,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  validateUUID('courseId'),
  asyncHandler(async (req, res) => {
    await courseService.delete(req.params.courseId);
    res.status(204).send();
  })
);

// Rate-limited search endpoint
router.get(
  '/search',
  strictLimiter,
  optionalAuth,
  validateQuery(searchSchema),
  asyncHandler(searchController)
);

export default router;
```

## Testing Middleware

```typescript
// __tests__/middleware/auth.test.ts
import { Request, Response } from 'express';

describe('requireAuth', () => {
  it('returns 401 when no token provided', async () => {
    const req = { headers: {} } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as Response;
    const next = vi.fn();
    
    await requireAuth(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
  
  it('calls next when valid token provided', async () => {
    const req = {
      headers: { authorization: 'Bearer valid-token' }
    } as Request;
    const res = {} as Response;
    const next = vi.fn();
    
    // Mock JWT verification
    vi.spyOn(jwt, 'verify').mockReturnValue({ userId: '123' } as any);
    
    await requireAuth(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
  });
});
```

## Best Practices

### DO
- ✅ Apply middleware in the correct order (security first)
- ✅ Use `asyncHandler` for all async route handlers
- ✅ Validate all user input (body, query, params)
- ✅ Log security events (failed auth, forbidden access)
- ✅ Return consistent error responses
- ✅ Use type-safe request extensions

### DON'T
- ❌ Forget to call `next()` in middleware
- ❌ Send multiple responses from one middleware
- ❌ Expose sensitive error details in production
- ❌ Skip validation on "internal" endpoints
- ❌ Trust user input (always validate)

## Resources

- [Express Middleware Guide](https://expressjs.com/en/guide/using-middleware.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Zod Documentation](https://zod.dev/)
- [Helmet.js](https://helmetjs.github.io/)
