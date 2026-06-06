# Development Rules

## Scope Discipline

- Stay focused on the requested development task.
- Do not drift into unrelated changes, refactors, tooling, or live verification unless explicitly requested.
- Do not start local servers, browser sessions, Playwright runs, Newman/Postman runs, or integration regression runs unless explicitly requested.
- Keep implementation changes scoped to what is required to complete the feature or fix.
- If verification is needed, limit it to non-invasive checks unless the user asks for broader testing.
- Leave unrelated existing workspace changes alone.

## Regression File Updates

- After every feature update, automatically update the relevant regression test files to reflect the new or changed feature behavior.
- At minimum, consider whether each of the following regression files needs coverage updates:
  1. `C:\Users\maisa\Desktop\asset-management-system\ams-server\integration_regression_test.go`
  2. `C:\Users\maisa\Desktop\asset-management-system\tests\regression\api\system-api-smoke.postman_collection.json`
  3. `C:\Users\maisa\Desktop\asset-management-system\tests\regression\e2e\whole-app-regression.spec.ts`
- If a listed regression file does not need a change for the feature, state that clearly in the final response.
- Do not run the regression suites after updating test files unless explicitly requested.
- Lightweight file-validity checks are allowed, such as formatting a touched Go test file or parsing a touched JSON collection.
- Keep test updates focused on the feature behavior and the edge cases introduced by the feature.
- When a feature introduces multiple valid states or branches, cover all relevant states in the affected focused regression file; do not skip a state only because another suite covers it.
- If an existing regression fixture starts failing because of a new validation rule, update the fixture setup to satisfy the new rule and add explicit assertions for the new behavior.
- For Newman/Postman collections, each focused collection must create its own prerequisite data for the behavior it tests; do not rely on data created by another collection.
- When asset assignment affects a focused Newman/Postman collection, include both project-backed assets and no-project/warehouse assets in that same collection.
- If a Newman failure leaves downstream URLs with blank IDs, fix the first failed setup request instead of chasing the later blank-ID failures.

## Manual Regression Testing

After every feature update, the user will manually run the following regression tests later and report the results back.

1. Go regression test:
   `C:\Users\maisa\Desktop\asset-management-system\ams-server\integration_regression_test.go`
2. Newman/Postman API testing:
   `C:\Users\maisa\Desktop\asset-management-system\tests\regression\api\system-api-smoke.postman_collection.json`
3. E2E Playwright testing:
   `C:\Users\maisa\Desktop\asset-management-system\tests\regression\e2e\whole-app-regression.spec.ts`
