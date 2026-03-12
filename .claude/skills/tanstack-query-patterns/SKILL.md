---
name: tanstack-query-patterns
description: React Query (TanStack Query) patterns for data fetching, caching, mutations, optimistic updates, and cache invalidation.
origin: React Query best practices
---

# TanStack Query Patterns

This skill covers React Query patterns for efficient data fetching and state management.

## When to Use

Use these patterns when:
- Fetching data from the API
- Handling mutations (create, update, delete)
- Implementing optimistic updates
- Managing cache invalidation
- Polling for async operations
- Handling pagination or infinite scroll

## Query Key Conventions

### Query Key Factories

Always use query key factories for consistency:

```typescript
// hooks/useCourses.ts
const courseKeys = {
  all: ['courses'] as const,
  list: (filters?: Record<string, string | number>) =>
    [...courseKeys.all, 'list', filters ?? {}] as const,
  detail: (slug: string) => [...courseKeys.all, 'detail', slug] as const,
  enrolled: () => [...courseKeys.all, 'enrolled'] as const,
  progress: (courseId: string) => [...courseKeys.all, 'progress', courseId] as const,
  calendar: (courseId: string, startDate?: string, endDate?: string) =>
    [...courseKeys.all, 'calendar', courseId, startDate ?? null, endDate ?? null] as const,
};

// Usage in hook
export function useCourses(filters?: CourseFilters) {
  return useQuery({
    queryKey: courseKeys.list(filters),
    queryFn: () => courseApi.listCourses(filters)
  });
}
```

### Key Naming Rules

```typescript
// ✅ Good: Hierarchical, predictable
const userKeys = {
  all: ['users'] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
  settings: (id: string) => [...userKeys.detail(id), 'settings'] as const,
};

// ❌ Bad: Flat structure, inconsistent
const badKeys = {
  users: ['users'],
  userById: (id: string) => ['user', id],
  userSettings: (id: string) => ['settings', id],
};
```

## Basic Data Fetching

### Simple Query

```typescript
import { useQuery } from '@tanstack/react-query';

export function useCourse(slug: string) {
  return useQuery({
    queryKey: courseKeys.detail(slug),
    queryFn: () => courseApi.getCourse(slug),
    enabled: !!slug, // Only fetch when slug exists
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}
```

### Conditional Fetching

```typescript
export function useLessonProgress(lessonId: string) {
  return useQuery({
    queryKey: courseKeys.lessonProgress(lessonId),
    queryFn: () => courseApi.getLessonProgress(lessonId),
    enabled: !!lessonId, // Don't fetch if no lessonId
  });
}
```

### Dependent Queries

```typescript
export function useCourseWithModules(courseId: string) {
  const courseQuery = useCourse(courseId);
  
  const modulesQuery = useQuery({
    queryKey: courseKeys.modules(courseId),
    queryFn: () => courseApi.getModules(courseId),
    enabled: !!courseId && courseQuery.isSuccess, // Wait for course to load
  });
  
  return {
    course: courseQuery.data,
    modules: modulesQuery.data,
    isLoading: courseQuery.isLoading || modulesQuery.isLoading,
  };
}
```

## Mutations

### Basic Mutation

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useEnrollCourse() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: courseApi.enroll,
    onSuccess: () => {
      // Invalidate enrolled courses list
      queryClient.invalidateQueries({ queryKey: courseKeys.enrolled() });
    },
  });
}
```

### Mutation with Error Handling

```typescript
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: userApi.updateProfile,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(data.id) });
      toast.success('Profile updated');
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Failed to update profile');
    },
  });
}
```

## Optimistic Updates

### Basic Optimistic Update

```typescript
export function useBookmarkLesson() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: courseApi.bookmarkLesson,
    
    // Optimistically update cache
    onMutate: async (lessonId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: courseKeys.bookmarks() });
      
      // Snapshot previous value
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(
        courseKeys.bookmarks()
      );
      
      // Optimistically update
      queryClient.setQueryData<Bookmark[]>(
        courseKeys.bookmarks(),
        (old) => [...(old || []), { lessonId, createdAt: new Date().toISOString() }]
      );
      
      // Return context for rollback
      return { previousBookmarks };
    },
    
    // Rollback on error
    onError: (_err, _variables, context) => {
      if (context?.previousBookmarks) {
        queryClient.setQueryData(courseKeys.bookmarks(), context.previousBookmarks);
      }
    },
    
    // Always refetch after mutation
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.bookmarks() });
    },
  });
}
```

### Complex Optimistic Update (Multi-Query)

```typescript
export function useCreateCalendarEvent(courseId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateEventInput) => courseApi.createCalendarEvent(courseId, data),
    
    onMutate: async (data) => {
      // Cancel all calendar queries for this course
      await queryClient.cancelQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key.length >= 4 && 
            key[0] === 'courses' && 
            key[1] === 'calendar' && 
            key[2] === courseId
          );
        }
      });
      
      // Get all affected queries for rollback
      const affectedQueries = queryClient.getQueriesData<{ data: CalendarEvent[] }>({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key.length >= 4 && 
            key[0] === 'courses' && 
            key[1] === 'calendar' && 
            key[2] === courseId
          );
        }
      });
      
      // Create optimistic event
      const optimisticEvent: CalendarEvent = {
        id: `temp-${Date.now()}`,
        title: data.title,
        description: data.description ?? null,
        startsAt: data.startsAt,
        endsAt: data.endsAt ?? null,
        courseId,
        createdAt: new Date().toISOString(),
      };
      
      // Update all matching queries
      queryClient.setQueriesData<{ data: CalendarEvent[] }>(
        {
          predicate: (query) => {
            const key = query.queryKey;
            return (
              key.length >= 4 && 
              key[0] === 'courses' && 
              key[1] === 'calendar' && 
              key[2] === courseId
            );
          }
        },
        (old) => {
          if (!old?.data) return old;
          return { ...old, data: [...old.data, optimisticEvent] };
        }
      );
      
      return { affectedQueries, optimisticEvent };
    },
    
    onError: (_err, _variables, context) => {
      // Rollback all affected queries
      if (context?.affectedQueries) {
        for (const [queryKey, data] of context.affectedQueries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    
    onSettled: () => {
      queryClient.invalidateQueries({ 
        queryKey: courseKeys.calendarAll(courseId) 
      });
    },
  });
}
```

## Cache Invalidation

### Single Query Invalidation

```typescript
export function useUpdateLesson() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ lessonId, data }) => courseApi.updateLesson(lessonId, data),
    onSuccess: (_, variables) => {
      // Invalidate specific lesson
      queryClient.invalidateQueries({ 
        queryKey: courseKeys.lesson(variables.lessonId) 
      });
    },
  });
}
```

### Multi-Query Invalidation

```typescript
export function useToggleCourseBookmark() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ courseId }: { courseId: string }) => 
      courseApi.toggleCourseBookmark(courseId),
    onSuccess: (_, variables) => {
      // Invalidate multiple related queries
      queryClient.invalidateQueries({
        queryKey: courseKeys.courseBookmarkStatus(variables.courseId)
      });
      queryClient.invalidateQueries({ 
        queryKey: courseKeys.courseBookmarks() 
      });
    },
  });
}
```

### Predicate-Based Invalidation

```typescript
export function useCreateCourse() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: courseApi.create,
    onSuccess: () => {
      // Invalidate all course-related queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === 'courses';
        }
      });
    },
  });
}
```

## Polling Patterns

### Polling for Async Operations

```typescript
export function useUploadLessonResource(courseId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ lessonId, file }: UploadParams) => 
      courseApi.uploadLessonResource(courseId, lessonId, file),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: courseKeys.resources(courseId) });
      
      // If scan is pending, start polling
      if (result.data.scanStatus === 'pending') {
        const pollInterval = setInterval(() => {
          queryClient.invalidateQueries({ queryKey: courseKeys.resources(courseId) });
        }, 3000);
        
        // Stop polling after 30 seconds
        setTimeout(() => clearInterval(pollInterval), 30000);
      }
    },
  });
}
```

### Conditional Polling

```typescript
export function useLessonWithProgress(lessonId: string) {
  return useQuery({
    queryKey: courseKeys.lesson(lessonId),
    queryFn: () => courseApi.getLesson(lessonId),
    refetchInterval: (query) => {
      // Poll every 5 seconds if processing
      const data = query.state.data;
      return data?.processingStatus === 'processing' ? 5000 : false;
    },
  });
}
```

## Prefetching

### Hover/Focus Prefetching

```typescript
import { useQueryClient } from '@tanstack/react-query';

export function CourseCard({ course }: { course: Course }) {
  const queryClient = useQueryClient();
  
  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: courseKeys.detail(course.slug),
      queryFn: () => courseApi.getCourse(course.slug),
      staleTime: 60 * 1000, // Prefetched data stays fresh for 1 minute
    });
  };
  
  return (
    <div onMouseEnter={handleMouseEnter}>
      {/* Card content */}
    </div>
  );
}
```

### Route-Level Prefetching

```typescript
// In router/loader
export async function courseLoader({ params }: LoaderFunctionArgs) {
  const queryClient = getQueryClient();
  
  await queryClient.prefetchQuery({
    queryKey: courseKeys.detail(params.slug!),
    queryFn: () => courseApi.getCourse(params.slug!),
  });
  
  return null;
}
```

## Infinite Queries

### Basic Infinite Scroll

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

export function useCoursePosts(courseId: string) {
  return useInfiniteQuery({
    queryKey: courseKeys.posts(courseId),
    queryFn: ({ pageParam = 1 }) => 
      socialApi.listPosts({ courseId, page: pageParam, limit: 20 }),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page >= lastPage.meta.totalPages) {
        return undefined;
      }
      return lastPage.meta.page + 1;
    },
    initialPageParam: 1,
  });
}
```

### Usage in Component

```typescript
function PostList({ courseId }: { courseId: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = 
    useCoursePosts(courseId);
  
  const posts = data?.pages.flatMap(page => page.data) ?? [];
  
  return (
    <>
      {posts.map(post => <PostCard key={post.id} post={post} />)}
      {hasNextPage && (
        <button 
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </>
  );
}
```

## Error Handling

### Retry Configuration

```typescript
export function useCriticalData() {
  return useQuery({
    queryKey: ['critical-data'],
    queryFn: fetchCriticalData,
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
```

### Error Boundary Integration

```typescript
export function useCourseWithErrorBoundary(slug: string) {
  return useQuery({
    queryKey: courseKeys.detail(slug),
    queryFn: () => courseApi.getCourse(slug),
    throwOnError: (error) => {
      // Only throw for non-404 errors (let 404s be handled by UI)
      return !(error instanceof ApiError && error.status === 404);
    },
  });
}
```

## Testing

### Mocking Queries

```typescript
// __tests__/CourseList.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

it('renders courses', async () => {
  const queryClient = createTestQueryClient();
  
  // Set initial data
  queryClient.setQueryData(courseKeys.list(), {
    data: [{ id: '1', title: 'Test Course' }],
  });
  
  render(
    <QueryClientProvider client={queryClient}>
      <CourseList />
    </QueryClientProvider>
  );
  
  expect(await screen.findByText('Test Course')).toBeInTheDocument();
});
```

### Testing Mutations

```typescript
it('updates cache on mutation', async () => {
  const queryClient = createTestQueryClient();
  const user = userEvent.setup();
  
  render(
    <QueryClientProvider client={queryClient}>
      <BookmarkButton lessonId="lesson-1" />
    </QueryClientProvider>
  );
  
  await user.click(screen.getByRole('button', { name: /bookmark/i }));
  
  // Verify cache was updated
  const bookmarks = queryClient.getQueryData(courseKeys.bookmarks());
  expect(bookmarks).toContainEqual(
    expect.objectContaining({ lessonId: 'lesson-1' })
  );
});
```

## Best Practices

### DO
- ✅ Use query key factories for consistency
- ✅ Set appropriate `staleTime` and `gcTime`
- ✅ Implement optimistic updates for better UX
- ✅ Handle errors gracefully
- ✅ Cancel queries when components unmount
- ✅ Use `enabled` option for conditional fetching

### DON'T
- ❌ Use random strings in query keys
- ❌ Mutate cache data directly (always use setQueryData)
- ❌ Forget to invalidate related queries after mutations
- ❌ Ignore loading states
- ❌ Over-fetch by not setting staleTime

## Resources

- [TanStack Query Docs](https://tanstack.com/query/latest)
- [Query Keys Guide](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
- [Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
