---
name: third-party-api-proxy
description: Backend proxy patterns for third-party API integrations. Protects API credentials and provides fallback handling for external services.
origin: API integration patterns
---

# Third-Party API Proxy Patterns

This skill covers the secure proxy pattern for integrating third-party APIs through the backend, protecting credentials and handling failures gracefully.

## When to Use

Use this pattern when:
- **Protecting API keys** - Never expose third-party credentials to the frontend
- **Rate limiting** - Control request volume to external APIs
- **Caching** - Cache external responses to reduce costs/latency
- **Error handling** - Provide fallbacks when external services fail
- **Data transformation** - Normalize external API responses to your format
- **Auditing** - Log all external API usage

## Architecture

```
Frontend (React Hook)
  ↓ GET /api/v1/external/search?q=query
Backend (Express Route)
  ↓ Authorization: Bearer {EXTERNAL_API_KEY}
External API (Third-Party Service)
```

## Basic Proxy Implementation

### Service Layer

```typescript
// services/external.service.ts
import { logger } from '../utils/logger.js';

interface ExternalApiResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export const externalService = {
  async search(query: string, page = 1, perPage = 20): Promise<ExternalApiResponse> {
    const apiKey = process.env.EXTERNAL_API_KEY;
    
    // Return mock data if not configured (development fallback)
    if (!apiKey) {
      logger.warn('External API not configured, returning mock data');
      return this.getMockData(query, page, perPage);
    }
    
    try {
      const response = await fetch(
        `https://api.external.com/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('External API error', {
          status: response.status,
          error: errorText,
          query: query.substring(0, 50), // Log truncated query
        });
        
        return {
          success: false,
          error: {
            code: 'EXTERNAL_API_ERROR',
            message: 'External service unavailable',
          },
        };
      }
      
      const data = await response.json();
      
      // Transform to our standard format
      return {
        success: true,
        data: this.transformResponse(data),
      };
      
    } catch (error) {
      logger.error('External API request failed', { error, query: query.substring(0, 50) });
      
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: 'Failed to fetch from external service',
        },
      };
    }
  },
  
  private transformResponse(externalData: unknown): unknown {
    // Normalize external API response to our format
    return {
      // ... transformation logic
    };
  },
  
  private getMockData(query: string, page: number, perPage: number): ExternalApiResponse {
    // Return mock data for development
    return {
      success: true,
      data: {
        results: [],
        total: 0,
        page,
        perPage,
      },
    };
  },
};
```

### Route Handler

```typescript
// routes/external.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, optionalAuth, validateQuery } from '../middleware/index.js';
import { externalService } from '../services/external.service.js';

const router = Router();

const searchSchema = z.object({
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(30).default(20),
});

/**
 * GET /external/search
 * Search external API (proxied for security)
 */
router.get(
  '/search',
  optionalAuth,
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const { q, page, per_page } = req.query as unknown as {
      q: string;
      page: number;
      per_page: number;
    };
    
    const result = await externalService.search(q, page, per_page);
    
    if (!result.success) {
      const status = result.error?.code === 'EXTERNAL_API_ERROR' ? 503 : 500;
      return res.status(status).json({
        error: result.error?.code,
        message: result.error?.message,
      });
    }
    
    return res.json({
      success: true,
      data: result.data,
    });
  })
);

export default router;
```

### Frontend Hook

```typescript
// hooks/useExternalSearch.ts
import { useQuery } from '@tanstack/react-query';

const externalKeys = {
  all: ['external'] as const,
  search: (query: string, page: number) => 
    [...externalKeys.all, 'search', query, page] as const,
};

interface SearchResult {
  id: string;
  title: string;
  description: string;
  // ...
}

interface SearchResponse {
  success: boolean;
  data: {
    results: SearchResult[];
    total: number;
    page: number;
    perPage: number;
  };
}

export function useExternalSearch(query: string, page = 1) {
  return useQuery({
    queryKey: externalKeys.search(query, page),
    queryFn: async (): Promise<SearchResponse> => {
      const response = await fetch(
        `/api/v1/external/search?q=${encodeURIComponent(query)}&page=${page}&per_page=20`
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Search failed');
      }
      
      return response.json();
    },
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
```

## Advanced Patterns

### With Response Caching

```typescript
import { redis } from '../config/redis.js';

export const externalService = {
  async search(query: string, page = 1, perPage = 20): Promise<ExternalApiResponse> {
    const cacheKey = `external:search:${query}:${page}:${perPage}`;
    
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    const result = await this.fetchFromApi(query, page, perPage);
    
    // Cache successful responses
    if (result.success) {
      await redis.setex(cacheKey, 3600, JSON.stringify(result)); // 1 hour TTL
    }
    
    return result;
  },
  
  private async fetchFromApi(query: string, page: number, perPage: number): Promise<ExternalApiResponse> {
    // ... API call implementation
  },
};
```

### With Rate Limiting

```typescript
import { rateLimit } from 'express-rate-limit';

// Strict rate limit for external API calls
const externalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many external API requests',
  standardHeaders: true,
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
});

router.get(
  '/search',
  externalApiLimiter,
  optionalAuth,
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    // ... handler
  })
);
```

### With Request Debouncing/Queue

```typescript
import { logger } from '../utils/logger.js';

// Simple in-memory queue for demo - use Redis/Bull in production
const requestQueue = new Map<string, Promise<unknown>>();

export const externalService = {
  async search(query: string, page = 1, perPage = 20): Promise<ExternalApiResponse> {
    const cacheKey = `external:search:${query}:${page}:${perPage}`;
    
    // Return existing promise if request is in flight
    if (requestQueue.has(cacheKey)) {
      logger.debug('Deduplicating external API request', { query: query.substring(0, 50) });
      return requestQueue.get(cacheKey) as Promise<ExternalApiResponse>;
    }
    
    const promise = this.fetchWithCache(query, page, perPage).finally(() => {
      requestQueue.delete(cacheKey);
    });
    
    requestQueue.set(cacheKey, promise);
    return promise;
  },
  
  private async fetchWithCache(query: string, page: number, perPage: number): Promise<ExternalApiResponse> {
    // ... implementation with caching
  },
};
```

### With Attribution Tracking

```typescript
interface ExternalResult {
  id: string;
  url: string;
  title: string;
  author: {
    name: string;
    url: string;
  };
  source: string;
}

export const externalService = {
  async search(query: string): Promise<ExternalApiResponse> {
    const result = await this.fetchFromApi(query);
    
    if (!result.success || !result.data) {
      return result;
    }
    
    // Add attribution metadata
    const dataWithAttribution = {
      ...result.data,
      results: result.data.results.map((item: ExternalResult) => ({
        ...item,
        attribution: {
          source: 'External API Name',
          sourceUrl: 'https://external.com',
          termsUrl: 'https://external.com/terms',
          requiresAttribution: true,
        },
      })),
    };
    
    return {
      success: true,
      data: dataWithAttribution,
    };
  },
};
```

## Error Handling Strategy

### Error Classification

```typescript
type ExternalErrorCode = 
  | 'EXTERNAL_API_ERROR'    // 5xx from external API
  | 'RATE_LIMITED'          // 429 from external API
  | 'INVALID_REQUEST'       // 4xx from external API
  | 'REQUEST_FAILED'        // Network error
  | 'NOT_CONFIGURED';       // Missing API key

function classifyError(response: Response, error?: Error): ExternalErrorCode {
  if (!response) return 'REQUEST_FAILED';
  if (response.status === 429) return 'RATE_LIMITED';
  if (response.status >= 500) return 'EXTERNAL_API_ERROR';
  if (response.status >= 400) return 'INVALID_REQUEST';
  return 'REQUEST_FAILED';
}
```

### Fallback Strategy

```typescript
export const externalService = {
  async searchWithFallback(query: string): Promise<ExternalApiResponse> {
    // Try primary API
    const primaryResult = await this.searchPrimary(query);
    if (primaryResult.success) {
      return primaryResult;
    }
    
    // Log primary failure
    logger.warn('Primary external API failed, trying fallback', {
      error: primaryResult.error,
    });
    
    // Try fallback API
    const fallbackResult = await this.searchFallback(query);
    if (fallbackResult.success) {
      return {
        ...fallbackResult,
        data: {
          ...fallbackResult.data,
          source: 'fallback',
        },
      };
    }
    
    // Return mock data as last resort
    logger.error('All external APIs failed, returning mock data');
    return this.getMockData(query, 1, 20);
  },
};
```

## Testing

### Mocking External API

```typescript
// __tests__/external.service.test.ts
import { vi } from 'vitest';

describe('externalService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  
  it('returns successful response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ id: '1', title: 'Test' }] }),
    } as Response);
    
    const result = await externalService.search('test');
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });
  
  it('returns error on API failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);
    
    const result = await externalService.search('test');
    
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('EXTERNAL_API_ERROR');
  });
  
  it('returns mock data when API key not configured', async () => {
    vi.stubEnv('EXTERNAL_API_KEY', '');
    
    const result = await externalService.search('test');
    
    expect(result.success).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

## Security Considerations

### API Key Protection

```typescript
// ✅ GOOD: Key stored in env, never logged
const apiKey = process.env.EXTERNAL_API_KEY;
if (!apiKey) {
  logger.warn('External API key not configured');
  return mockData;
}

// ❌ BAD: Never do this
logger.info('Using API key', { apiKey }); // NEVER log secrets!
```

### Input Validation

```typescript
const searchSchema = z.object({
  q: z.string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[\w\s-]+$/), // Whitelist allowed characters
  page: z.coerce.number().int().min(1).max(100).default(1),
  per_page: z.coerce.number().int().min(1).max(30).default(20),
});
```

### Request Logging

```typescript
router.get(
  '/search',
  optionalAuth,
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const { q } = req.query as { q: string };
    
    // Log for auditing (truncate query for privacy)
    logger.info('External API search', {
      userId: req.user?.id,
      queryTruncated: q.substring(0, 50),
      queryLength: q.length,
      ip: req.ip,
    });
    
    // ... rest of handler
  })
);
```

## Configuration

### Environment Variables

```env
# .env
# External API Configuration
EXTERNAL_API_KEY=your_api_key_here
EXTERNAL_API_URL=https://api.external.com
EXTERNAL_RATE_LIMIT_PER_MINUTE=60
EXTERNAL_CACHE_TTL_SECONDS=3600
```

### TypeScript Types

```typescript
// types/external.ts
export interface ExternalApiConfig {
  apiKey: string;
  baseUrl: string;
  rateLimitPerMinute: number;
  cacheTtlSeconds: number;
}

export interface ExternalSearchParams {
  query: string;
  page?: number;
  perPage?: number;
}

export interface ExternalSearchResult {
  id: string;
  title: string;
  description?: string;
  url: string;
  thumbnailUrl?: string;
  attribution?: {
    source: string;
    author?: string;
    requiresAttribution: boolean;
  };
}
```

## Resources

- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [Express Rate Limit](https://www.npmjs.com/package/express-rate-limit)
- [Zod Validation](https://zod.dev/)
