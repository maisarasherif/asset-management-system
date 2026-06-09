# Lessons Learnt

## Incident: Template Detail Page Crash on Render

**Date:** May 2026  
**App:** AMS Cloudscape (React + TanStack Query + Cloudscape Design)  
**Affected Pages:** `TemplateDetailPage`, `TemplateConfigurePage`

---

### What Happened

The application threw a `Page error` with the message:

```
TypeError: Cannot read properties of null (reading 'length')
```

The error originated in `TemplateDetailPage` during render, specifically inside a `.reduce()` call on `component.tests`. The page became completely unloadable, blocking access to all template detail views.

A secondary error followed after the first fix:

```
TypeError: Cannot read properties of null (reading 'map')
```

This came from the blueprint details section rendering test pills via `component.tests.map(...)`.

---

### Root Cause

**Race condition in TanStack Query's state machine.**

The code assumed that if `!isLoading && !isError`, then `data` is guaranteed to be non-null. However, TanStack Query has a transitional state — particularly on first mount, after a cache invalidation, or after a session reload — where none of `isLoading`, `isError`, or `data` are fully resolved yet. In that brief window, `data` is `null` or `undefined`.

Additionally, the API response itself could return `component.tests` as `null` for a component that had no tests assigned, rather than an empty array `[]`. The frontend did not defensively handle this at the point of use.

Three specific locations in `TemplateDetailPage.tsx` were affected:

1. `configuredComponents.reduce(...)` — `component.tests.length` called on null
2. Column cell renderer — `item.tests.length` called on null  
3. Blueprint details section — `component.tests.map(...)` called on null

A similar issue existed in `TemplateConfigurePage.tsx` where `categoriesQuery.data.length` and `testTypesQuery.data.length` were accessed without null guards in the error boundary check.

---

### Fixes Applied

**`TemplateDetailPage.tsx`**

```ts
// 1. configuredComponents fallback
const configuredComponents = configurationQuery.data ?? [];

// 2. totalTests reduce
const totalTests = configuredComponents.reduce(
  (count, component) => count + (component.tests ?? []).length,
  0
);

// 3. Column cell renderer
cell: (item) => (item.tests ?? []).length,

// 4. Blueprint test pills
{(component.tests ?? []).map((test) => (
  <span key={test.template_component_test_id} className="template-pill">
    {testTypeMap.get(test.test_id) || test.test_name}
  </span>
))}
```

**`TemplateConfigurePage.tsx`**

```ts
// Added missing null guards to the error boundary check
if (
  templateQuery.isError ||
  configurationQuery.isError ||
  categoriesQuery.isError ||
  mainCategoriesQuery.isError ||
  testTypesQuery.isError ||
  !templateQuery.data ||
  !configurationQuery.data ||
  !categoriesQuery.data ||   // added
  !testTypesQuery.data       // added
) {
  return <PageError ... />;
}
```

---

### Side Effect: Duplicate Component in Database

Because the page was crashing during render, a user had already successfully submitted the save mutation (component + tests were created in the database) before the crash interrupted the UI. Believing the save had failed, they attempted to save again — creating a duplicate component with no tests.

The duplicate was identified and removed directly from the database

---

### Lessons Learnt

1. **Never assume `data` is non-null after a loading/error check.** TanStack Query has a transitional state where `isLoading` is false, `isError` is false, but `data` is still null. Always use `?? []` or `?? null` fallbacks at the point of use.

2. **API responses may return `null` instead of empty arrays.** Treat every array field from an API as potentially null, especially nested ones like `component.tests`. Apply `?? []` defensively at the point of use rather than relying on the API contract.

3. **Crashes during a successful mutation cause user confusion and data duplication.** If a mutation succeeds but the UI crashes before confirming it, users will retry — creating duplicates. Improving crash resilience directly reduces data integrity risk.

4. **Audit the codebase for the pattern `someQuery.data.something` used directly.** Any place where `.length`, `.map()`, `.reduce()`, or `.find()` is called directly on query data without a null fallback is a latent crash. Search for this pattern and apply `?? []` consistently.
