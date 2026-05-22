import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:8080/v1";
const SUPER_ADMIN_EMAIL =
  process.env.PLAYWRIGHT_ADMIN_EMAIL ||
  process.env.SEED_ADMIN_EMAIL ||
  "integration-admin@example.com";
const SUPER_ADMIN_PASSWORD =
  process.env.PLAYWRIGHT_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "admin-password";

type LoginResponse = {
  token?: string;
  role?: string;
};

type CreatedUser = {
  user_id: string;
  email: string;
  role: string;
};

async function loginApi(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/login`, {
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as LoginResponse;
  expect(session.token).toBeTruthy();
  return session;
}

async function createUser(
  request: APIRequestContext,
  token: string,
  user: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    role: "SUPER_ADMIN" | "ADMIN" | "USER" | "CLIENT";
  }
) {
  const response = await request.post(`${API_BASE_URL}/user`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      ...user,
      status: "ACTIVE",
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as CreatedUser;
}

async function deleteUserIfPresent(request: APIRequestContext, token: string, userId?: string) {
  if (!userId) {
    return;
  }

  const response = await request.delete(`${API_BASE_URL}/user/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect([200, 404]).toContain(response.status());
}

test.describe("user management permissions", () => {
  test("admins can manage regular users but cannot manage admins or reset passwords", async () => {
    const api = await playwrightRequest.newContext();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let superAdminToken = "";
    let managedAdmin: CreatedUser | undefined;
    let regularUser: CreatedUser | undefined;
    let adminCreatedUser: CreatedUser | undefined;

    try {
      const superAdminSession = await loginApi(api, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
      expect(superAdminSession.role).toBe("SUPER_ADMIN");
      superAdminToken = superAdminSession.token!;

      const adminPassword = `Admin-${suffix}`;
      const userPassword = `User-${suffix}`;
      const changedAdminPassword = `Changed-${suffix}`;

      managedAdmin = await createUser(api, superAdminToken, {
        first_name: "Permission",
        last_name: "Admin",
        email: `permission-admin-${suffix}@example.com`,
        password: adminPassword,
        role: "ADMIN",
      });

      regularUser = await createUser(api, superAdminToken, {
        first_name: "Permission",
        last_name: "User",
        email: `permission-user-${suffix}@example.com`,
        password: userPassword,
        role: "USER",
      });

      const superAdminPasswordReset = await api.put(
        `${API_BASE_URL}/user/${managedAdmin.user_id}/password`,
        {
          headers: { Authorization: `Bearer ${superAdminToken}` },
          data: { new_password: changedAdminPassword },
        }
      );
      expect(superAdminPasswordReset.status()).toBe(200);

      const adminSession = await loginApi(api, managedAdmin.email, changedAdminPassword);
      expect(adminSession.role).toBe("ADMIN");
      const adminToken = adminSession.token!;

      const createRegularUser = await api.post(`${API_BASE_URL}/user`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          first_name: "Admin",
          last_name: "Created",
          email: `admin-created-user-${suffix}@example.com`,
          password: `Created-${suffix}`,
          role: "USER",
          status: "ACTIVE",
        },
      });
      expect(createRegularUser.status()).toBe(201);
      adminCreatedUser = (await createRegularUser.json()) as CreatedUser;

      const createAdmin = await api.post(`${API_BASE_URL}/user`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          first_name: "Blocked",
          last_name: "Admin",
          email: `blocked-admin-${suffix}@example.com`,
          password: `Blocked-${suffix}`,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      expect(createAdmin.status()).toBe(403);
      await expect(createAdmin.json()).resolves.toMatchObject({
        error: "only SUPER ADMIN can create admin users",
      });

      const promoteUser = await api.put(`${API_BASE_URL}/user/${regularUser.user_id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          first_name: regularUser.email.split("@")[0],
          last_name: "Promoted",
          email: regularUser.email,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      expect(promoteUser.status()).toBe(403);
      await expect(promoteUser.json()).resolves.toMatchObject({
        error: "only SUPER ADMIN can manage admin users",
      });

      const editAdmin = await api.put(`${API_BASE_URL}/user/${managedAdmin.user_id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          first_name: "Permission",
          last_name: "Admin Edited",
          email: managedAdmin.email,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      expect(editAdmin.status()).toBe(403);
      await expect(editAdmin.json()).resolves.toMatchObject({
        error: "only SUPER ADMIN can manage admin users",
      });

      const resetUserPassword = await api.put(
        `${API_BASE_URL}/user/${regularUser.user_id}/password`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: { new_password: `BlockedReset-${suffix}` },
        }
      );
      expect(resetUserPassword.status()).toBe(403);
      await expect(resetUserPassword.json()).resolves.toMatchObject({
        error: "only SUPER ADMIN can change user passwords",
      });

      const regularUserStillHasOriginalPassword = await api.post(`${API_BASE_URL}/login`, {
        data: { email: regularUser.email, password: userPassword },
      });
      expect(regularUserStillHasOriginalPassword.status()).toBe(200);
    } finally {
      if (superAdminToken) {
        await deleteUserIfPresent(api, superAdminToken, adminCreatedUser?.user_id);
        await deleteUserIfPresent(api, superAdminToken, regularUser?.user_id);
        await deleteUserIfPresent(api, superAdminToken, managedAdmin?.user_id);
      }
      await api.dispose();
    }
  });
});
