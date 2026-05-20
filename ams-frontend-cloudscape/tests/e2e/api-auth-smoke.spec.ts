import { expect, request as playwrightRequest, test } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:8080/v1";
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

test.describe("live API auth smoke", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run API smoke tests."
  );

  test("login, session, cookie auth, bearer fallback, and logout", async () => {
    const api = await playwrightRequest.newContext();

    const health = await api.get(`${API_BASE_URL}/health`);
    expect(health.status()).toBe(200);

    const login = await api.post(`${API_BASE_URL}/login`, {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });
    expect(login.status()).toBe(200);

    const loginBody = (await login.json()) as { token?: string; role?: string };
    expect(loginBody.role).toBe("SUPER_ADMIN");
    expect(loginBody.token).toBeTruthy();

    const state = await api.storageState();
    const accessCookie = state.cookies.find((cookie) => cookie.name === "ams_access_token");
    expect(accessCookie).toBeTruthy();
    expect(accessCookie?.httpOnly).toBe(true);

    const cookieApi = await playwrightRequest.newContext({
      storageState: state,
    });

    const session = await cookieApi.get(`${API_BASE_URL}/session`);
    expect(session.status()).toBe(200);
    const sessionBody = (await session.json()) as { email?: string; token?: string };
    expect(sessionBody.email).toBe(ADMIN_EMAIL);
    expect(sessionBody.token).toBeUndefined();

    const assetsWithCookie = await cookieApi.get(`${API_BASE_URL}/assets`);
    expect(assetsWithCookie.status()).toBe(200);

    const bearerApi = await playwrightRequest.newContext({
      extraHTTPHeaders: {
        Authorization: `Bearer ${loginBody.token}`,
      },
    });
    const assetsWithBearer = await bearerApi.get(`${API_BASE_URL}/assets`);
    expect(assetsWithBearer.status()).toBe(200);

    const logout = await cookieApi.post(`${API_BASE_URL}/logout`);
    expect(logout.status()).toBe(200);

    const clearedState = await cookieApi.storageState();
    const clearedCookie = clearedState.cookies.find((cookie) => cookie.name === "ams_access_token");
    expect(clearedCookie).toBeFalsy();

    const sessionAfterLogout = await cookieApi.get(`${API_BASE_URL}/session`);
    expect(sessionAfterLogout.status()).toBe(401);

    await bearerApi.dispose();
    await cookieApi.dispose();
    await api.dispose();
  });
});
