---
name: backend-patterns
description: Backend architecture patterns for Express.js, Prisma ORM, and Node.js. Service layer patterns, API design, Zod validation, and authorization using SpiceDB.
origin: Express.js best practices
---

# Backend Development Patterns

Backend architecture patterns for Express.js + Prisma + PostgreSQL stack.

## When to Activate

- Designing REST API endpoints with Express.js
- Implementing service layer patterns with Prisma
- Adding Zod validation schemas
- Working with SpiceDB authorization
- Implementing middleware (auth, validation, rate limiting)
- Structuring error handling and API responses

## Project Stack

- **Runtime**: Node.js 20+ with Express.js
- **Database**: PostgreSQL with Prisma ORM 6.3
- **Validation**: Zod schemas
- **Auth**: Supabase Auth (JWT) + SpiceDB (fine-grained permissions)
- **Cache**: Redis (ioredis)
- **Storage**: Cloudflare R2

## API Design Patterns

### RESTful API Structure

```typescript
// routes/course.routes.ts
import { Router } from 'express';
import { courseController } from '@/controllers/course.controller';
import { validateBody } from '@/middleware/validation';
import { createCourseSchema, updateCourseSchema } from '@/validators/course';
import { requireAuth } from '@/middleware/auth';

const router = Router();

router.get('/', courseController.list);
router.get('/:id', courseController.getById);
router.post('/', requireAuth, validateBody(createCourseSchema), courseController.create);
router.put('/:id', requireAuth, validateBody(updateCourseSchema), courseController.update);
router.delete('/:id', requireAuth, courseController.remove);

export default router;
```

### Service Layer Pattern

```typescript
// services/course.service.ts
import { prisma } from '@/config/database';
import { checkPermission, createRel } from '@/config/spicedb';
import { ForbiddenError, NotFoundError } from '@/utils/errors';

export class CourseService {
  async createCourse(userId: string, data: CreateCourseInput) {
    // Create course in database
    const course = await prisma.course.create({
      data: {
        ...data,
        creatorId: userId
      }
    });

    // Create ownership relationship in SpiceDB
    await createRel(
      { objectType: 'course', objectId: course.id },
      'owner',
      { objectType: 'user', objectId: userId }
    );

    return course;
  }

  async updateCourse(userId: string, courseId: string, data: UpdateCourseInput) {
    // Check permission via SpiceDB
    const canEdit = await checkPermission(
      { objectType: 'course', objectId: courseId },
      'edit',
      { objectType: 'user', objectId: userId }
    );

    if (!canEdit) {
      throw new ForbiddenError('You do not have permission to edit this course');
    }

    return prisma.course.update({
      where: { id: courseId },
      data
    });
  }

  async getCourseWithModules(courseId: string) {
    return prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: { orderBy: { order: 'asc' } }
          }
        }
      }
    });
  }
}

export const courseService = new CourseService();
```

### Controller Pattern

```typescript
// controllers/course.controller.ts
import { Request, Response, NextFunction } from 'express';
import { courseService } from '@/services/course.service';

export const courseController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = '1', perPage = '20' } = req.query;
      const courses = await courseService.listCourses({
        page: parseInt(page as string),
        perPage: parseInt(perPage as string)
      });

      res.json({
        data: courses,
        meta: { page: parseInt(page as string), perPage: parseInt(perPage as string) }
      });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const course = await courseService.createCourse(userId, req.body);
      res.status(201).json({ data: course });
    } catch (error) {
      next(error);
    }
  }
};
```

## Database Patterns

### Prisma Queries

```typescript
// Select only needed columns
const courses = await prisma.course.findMany({
  select: {
    id: true,
    title: true,
    description: true,
    status: true,
    creator: {
      select: { id: true, displayName: true }
    }
  },
  where: { status: 'published' },
  orderBy: { createdAt: 'desc' },
  take: 20
});

// Include related data efficiently
const course = await prisma.course.findUnique({
  where: { id: courseId },
  include: {
    modules: {
      orderBy: { order: 'asc' },
      include: {
        lessons: { orderBy: { order: 'asc' } }
      }
    },
    creator: { select: { id: true, displayName: true, avatarUrl: true } }
  }
});
```

### Prisma Transactions

```typescript
// Use interactive transactions for multi-step operations
const enrollment = await prisma.$transaction(async (tx) => {
  // Create enrollment
  const enrollment = await tx.enrollment.create({
    data: { userId, courseId }
  });

  // Create initial progress records
  await tx.lessonProgress.createMany({
    data: lessons.map(lesson => ({
      userId,
      lessonId: lesson.id,
      status: 'not_started'
    }))
  });

  // Award XP
  await tx.xpTransaction.create({
    data: { userId, amount: 50, reason: 'course_enrollment' }
  });

  return enrollment;
});
```

### N+1 Query Prevention

```typescript
// ❌ BAD: N+1 query problem
const courses = await prisma.course.findMany();
for (const course of courses) {
  course.creator = await prisma.user.findUnique({ where: { id: course.creatorId } });
}

// ✅ GOOD: Use include to fetch in single query
const courses = await prisma.course.findMany({
  include: {
    creator: { select: { id: true, displayName: true } }
  }
});

// ✅ GOOD: Batch fetch for complex cases
const courses = await prisma.course.findMany();
const creatorIds = [...new Set(courses.map(c => c.creatorId))];
const creators = await prisma.user.findMany({
  where: { id: { in: creatorIds } },
  select: { id: true, displayName: true }
});
const creatorMap = new Map(creators.map(c => [c.id, c]));
```

## Validation Patterns

### Zod Schema Definition

```typescript
// validators/course.ts
import { z } from 'zod';

export const createCourseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  category: z.enum(['programming', 'design', 'business', 'marketing']),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  isPublic: z.boolean().default(false)
});

export const updateCourseSchema = createCourseSchema.partial();

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
```

### Validation Middleware Usage

```typescript
// In routes
import { validateBody, validateQuery, validateParams } from '@/middleware/validation';
import { createCourseSchema } from '@/validators/course';

router.post('/', requireAuth, validateBody(createCourseSchema), courseController.create);

// Validate query params
const listQuerySchema = z.object({
  page: z.string().optional().transform(v => parseInt(v ?? '1')),
  perPage: z.string().optional().transform(v => parseInt(v ?? '20')),
  search: z.string().optional()
});

router.get('/', validateQuery(listQuerySchema), courseController.list);
```

## Authorization Patterns

### SpiceDB Permission Checking

```typescript
import { checkPermission, createRel, deleteRel } from '@/config/spicedb';

// Check single permission
async function canUserEditCourse(userId: string, courseId: string): Promise<boolean> {
  return checkPermission(
    { objectType: 'course', objectId: courseId },
    'edit',
    { objectType: 'user', objectId: userId }
  );
}

// Check multiple permissions in parallel
async function getCoursePermissions(userId: string, courseId: string) {
  const [canView, canEdit, canManage] = await Promise.all([
    checkPermission({ objectType: 'course', objectId: courseId }, 'view', { objectType: 'user', objectId: userId }),
    checkPermission({ objectType: 'course', objectId: courseId }, 'edit', { objectType: 'user', objectId: userId }),
    checkPermission({ objectType: 'course', objectId: courseId }, 'manage', { objectType: 'user', objectId: userId })
  ]);

  return { canView, canEdit, canManage };
}
```

### Permission Middleware

```typescript
// middleware/requirePermission.ts
import { checkPermission } from '@/config/spicedb';

export function requirePermission(
  resourceType: string,
  permission: string,
  resourceIdParam: string = 'id'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const resourceId = req.params[resourceIdParam];
    const hasPermission = await checkPermission(
      { objectType: resourceType, objectId: resourceId },
      permission,
      { objectType: 'user', objectId: req.user.id }
    );

    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    next();
  };
}

// Usage in routes
router.put('/courses/:id', requireAuth, requirePermission('course', 'edit'), courseController.update);
```

## Error Handling Patterns

### Custom Error Classes

```typescript
// utils/errors.ts
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Access denied') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}
```

### Error Handler Middleware

```typescript
// middleware/errorHandler.ts
import { ApiError } from '@/utils/errors';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message
    });
  }

  // Prisma errors
  if (err.code?.startsWith('P')) {
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Record not found'
      });
    }
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'DUPLICATE',
        message: 'Record already exists'
      });
    }
  }

  // Log unexpected errors
  logger.error('Unexpected error', { error: err.message, stack: err.stack });

  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
}
```

## Caching Patterns

### Redis Cache Layer

```typescript
import { redis } from '@/config/redis';

export class CachedCourseService {
  async getCourse(courseId: string) {
    const cacheKey = `course:${courseId}`;

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const course = await prisma.course.findUnique({
      where: { id: courseId }
    });

    if (course) {
      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(course));
    }

    return course;
  }

  async invalidateCourse(courseId: string) {
    await redis.del(`course:${courseId}`);
  }
}
```

## Key Principles

1. **Service Layer**: Business logic belongs in services, not controllers
2. **Prisma Best Practices**: Use `select` to limit fields, `include` for relations
3. **Transactions**: Use `$transaction` for multi-step database operations
4. **Validation**: Always validate with Zod at API boundaries
5. **Authorization**: Check permissions via SpiceDB before sensitive operations
6. **Error Handling**: Use custom error classes and centralized error handler
7. **Type Safety**: Infer types from Zod schemas using `z.infer`

**Remember**: Keep controllers thin, services focused, and database queries efficient. Always validate input and check permissions before mutating data.
