# fs-router

Type-safe router service factory with CRUD navigation and middleware pipeline.

```bash
npm install @script-development/fs-router
```

**Peer dependencies:** `vue ^3.5.0`, `vue-router ^4.5.0`

## What It Does

`fs-router` wraps [Vue Router](https://router.vuejs.org/) in a service factory that adds type-safe navigation, CRUD route scaffolding, and a middleware pipeline. It extracts route names from your route definitions and validates navigation calls at compile time — no more runtime "route not found" errors from typos.

## Basic Usage

### Define Your Routes

```typescript
import {createCrudRoutes, createRouterService} from '@script-development/fs-router';

const routes = [
    createCrudRoutes('/users', 'users', UsersLayout, {
        overview: UsersList,
        create: UserCreate,
        edit: UserEdit,
        show: UserDetail,
    }),
    createCrudRoutes('/projects', 'projects', ProjectsLayout, {
        overview: ProjectsList,
        create: ProjectCreate,
        edit: ProjectEdit,
    }),
];

const router = createRouterService(routes);
```

`createCrudRoutes` generates four child routes:

- `users.overview` → `/users`
- `users.create` → `/users/create`
- `users.edit` → `/users/:id/edit`
- `users.show` → `/users/:id`

Omit a component to skip that route — `projects` above has no `show` page.

### Type-Safe Navigation

```typescript
// These compile — the route names exist
router.goToOverviewPage('users');
router.goToCreatePage('users');
router.goToEditPage('users', 42);
router.goToShowPage('users', 42);

// This doesn't compile — "users" has no show page... wait, it does
// But "projects" doesn't:
router.goToShowPage('projects', 1); // compile error — no show route for projects
```

### Use in Components

```vue
<script setup lang="ts">
import {router} from '@/services';
</script>

<template>
    <button @click="router.goToCreatePage('users')">New User</button>

    <button @click="router.goBack()">Back</button>
</template>
```

## CRUD Route Factories

### createCrudRoutes

Generates a parent route with up to four child routes:

```typescript
createCrudRoutes(
    '/users', // base path
    'users', // base route name
    UsersLayout, // parent component (wraps children)
    {
        overview: UsersList, // → /users (name: "users.overview")
        create: UserCreate, // → /users/create (name: "users.create")
        edit: UserEdit, // → /users/:id/edit (name: "users.edit")
        show: UserDetail, // → /users/:id (name: "users.show")
    },
    {requiresAuth: true}, // optional route meta
);
```

### createNestedCrudRoutes

For nested resources with a parent ID:

```typescript
createNestedCrudRoutes({parent: 'projects', child: 'issues'}, 'project-issues', ProjectIssuesLayout, {
    overview: IssuesList, // → /projects/:parentId/issues
    create: IssueCreate, // → /projects/:parentId/issues/create
    edit: IssueEdit, // → /projects/:parentId/issues/:id/edit
    show: IssueDetail, // → /projects/:parentId/issues/:id
});
```

Navigate with both IDs:

```typescript
router.goToEditPage('project-issues', 7); // issue ID
router.goToRoute('project-issues.overview', undefined, undefined, 3); // project ID as parentId
```

## Route State

The service exposes reactive route state:

```typescript
// Current route reference
router.currentRouteRef; // Ref<RouteLocationNormalizedLoaded>

// Parsed parameters
router.currentRouteId; // ComputedRef<number> — parsed :id
router.currentRouteSlug; // ComputedRef<string> — raw :id as string
router.currentParentId; // ComputedRef<number> — parsed :parentId
router.currentRouteQuery; // ComputedRef<LocationQuery>
```

### Page Predicates

Check which page the user is currently on:

```typescript
if (router.onEditPage('users')) {
    // Currently on /users/:id/edit
    const userId = router.currentRouteId.value;
}

if (router.onOverviewPage('projects')) {
    // Currently on /projects
}

// General check by exact route name
if (router.onPage('users.create')) {
    // Currently on /users/create
}
```

## Middleware Pipeline

Register navigation guards that run before or after route changes:

### Before Navigation

A before-route middleware returns either a **boolean** or a **typed redirect object**. The first middleware that returns something truthy (a `true` or an object) short-circuits the chain — later middleware do not run.

**Boolean form** — `true` cancels the pending navigation, a falsy value lets it continue:

```typescript
const unregister = router.registerBeforeRouteMiddleware((to, from) => {
    // Cancel navigation into a locked section
    if (to.meta.locked) return true;
    return false; // allow navigation
});
```

**Redirect form** — return `{name, id?, query?, parentId?, replace?}` to **cancel the pending hop and navigate to the target in one step**. This is the type-safe replacement for the old cancel-then-`goToRoute` two-step (return a redirect object instead of calling `goToRoute` yourself and returning `true`):

```typescript
const unregister = router.registerBeforeRouteMiddleware((to) => {
    // Bounce unauthenticated visitors to login
    if (to.meta.requiresAuth && !isAuthenticated()) {
        return {name: 'login'};
    }
    return false;
});
```

The redirect **pushes** by default (a new history entry). Set `replace: true` to replace the current entry instead — use it for bounces that should not be reachable via Back (a consumed OAuth callback, a 404-home redirect):

```typescript
router.registerBeforeRouteMiddleware((to) => (to.meta.deadLink ? {name: 'dashboard', replace: true} : false));
```

`id`, `query`, and `parentId` on the redirect object thread through to the target exactly as they do for `goToRoute`. The redirect object short-circuits the middleware chain identically to a truthy boolean.

### After Navigation

```typescript
const unregister = router.registerAfterRouteMiddleware((to, from) => {
    trackPageView(to.path);
});
```

Both return unregister functions for cleanup.

## Custom Components

The service provides wrapped versions of Vue Router's components:

```vue
<script setup lang="ts">
import {router} from '@/services';
</script>

<template>
    <!-- RouterView with depth support for nested layouts -->
    <router.RouterView :depth="0" />

    <!-- Type-safe RouterLink -->
    <router.RouterLink to="/users">Users</router.RouterLink>
</template>
```

`RouterLink` forwards consumer-set attributes (`class`, `style`, `data-*`, `aria-*`, …) onto the rendered `<a>`, so a styled link keeps its styling:

```vue
<router.RouterLink :to="{name: 'users.overview'}" class="nav-link" aria-current="page">Users</router.RouterLink>
```

The computed `href` and the navigation `onClick` stay authoritative — a fallthrough `href` attribute cannot override them.

## URL Generation

Generate URLs without navigating:

```typescript
const url = router.getUrlForRouteName('users.edit', 42);
// "/users/42/edit"

const url = router.getUrlForRouteName('project-issues.show', 7, undefined, 3);
// "/projects/3/issues/7"
```

## Query Parameters

```typescript
// Read current query
const query = router.currentRouteQuery.value;

// Update query without full navigation
router.changeRouteQuery({page: '2', sort: 'name'});
```

## Configuration

```typescript
const router = createRouterService(routes, {
    base: '/app', // base path for all routes
    afterRouteCallbacks: [
        // global after-route hooks
        (to, from) => {
            /* ... */
        },
    ],
    notFoundComponent: NotFoundPage, // rendered by RouterView when no route matches
});
```

Without `notFoundComponent`, `RouterView` renders a bare `404` string for an unmatched depth. Provide a component to render your own designed not-found page instead — pair it with a catch-all route (`{path: '/:pathMatch(.*)*', ...}`) to also own the URL.

The fallback is reserved for a **genuine** miss. Before the first navigation resolves, `currentRouteRef` still holds vue-router's `START_LOCATION` sentinel, and `RouterView` renders nothing at all rather than a not-found page — `await routerService.install()` (or `await routerService.isReady()`) before `mount()` if you want that window closed entirely.

## API Reference

### `createRouterService(routes, options?)`

| Parameter                     | Type                    | Description                                                          |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `routes`                      | `RouteRecordRaw[]`      | Route definitions                                                    |
| `options.base`                | `string`                | Base path for routing                                                |
| `options.afterRouteCallbacks` | `NavigationHookAfter[]` | Global after-navigation hooks                                        |
| `options.notFoundComponent`   | `RouteComponent`        | Rendered by `RouterView` on an unmatched route (default: bare `404`) |

### Navigation Methods

| Method                                       | Description                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `goToRoute(name, id?, query?, parentId?)`    | Navigate to any named route (push)                                       |
| `replaceRoute(name, id?, query?, parentId?)` | Navigate, replacing the current history entry                            |
| `goToOverviewPage(name)`                     | Navigate to `name.overview`                                              |
| `goToCreatePage(name)`                       | Navigate to `name.create`                                                |
| `goToEditPage(name, id)`                     | Navigate to `name.edit` with `:id`                                       |
| `goToShowPage(name, id, query?)`             | Navigate to `name.show` with `:id`                                       |
| `goBack()`                                   | Navigate back in history                                                 |
| `install()`                                  | Navigate to the current browser location; returns the navigation promise |
| `isReady()`                                  | Resolves once the first navigation has settled                           |

### Route State

| Property            | Type                         | Description              |
| ------------------- | ---------------------------- | ------------------------ |
| `currentRouteRef`   | `Ref<RouteLocation>`         | Full current route       |
| `currentRouteId`    | `ComputedRef<number>`        | Parsed `:id` param       |
| `currentRouteSlug`  | `ComputedRef<string>`        | Raw `:id` as string      |
| `currentParentId`   | `ComputedRef<number>`        | Parsed `:parentId` param |
| `currentRouteQuery` | `ComputedRef<LocationQuery>` | Current query params     |

### Predicates

| Method                 | Returns   | Description            |
| ---------------------- | --------- | ---------------------- |
| `onPage(name)`         | `boolean` | Exact route name match |
| `onOverviewPage(name)` | `boolean` | On `name.overview`     |
| `onCreatePage(name)`   | `boolean` | On `name.create`       |
| `onEditPage(name)`     | `boolean` | On `name.edit`         |
| `onShowPage(name)`     | `boolean` | On `name.show`         |
| `routeExists(to)`      | `boolean` | Route is resolvable    |

### Route Factories

| Function                                                          | Description                 |
| ----------------------------------------------------------------- | --------------------------- |
| `createCrudRoutes(path, name, component, children, meta?)`        | Generate CRUD child routes  |
| `createNestedCrudRoutes(paths, name, component, children, meta?)` | Generate nested CRUD routes |
