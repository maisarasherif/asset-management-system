import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";
import { createDecipheriv } from "node:crypto";
import { execFileSync } from "node:child_process";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:8080/v1";
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const DATABASE_URL = process.env.PLAYWRIGHT_DATABASE_URL || process.env.DATABASE_URL;
const RESET_EMAIL_JOB_ENCRYPTION_KEY = process.env.RESET_EMAIL_JOB_ENCRYPTION_KEY;

type LoginResponse = {
  token?: string;
  role?: "SUPER_ADMIN" | "ADMIN" | "USER" | "CLIENT";
};

type CreatedUser = {
  user_id: string;
  email: string;
  role: string;
};

type PasswordResetJobArgs = {
  to_address: string;
  subject: string;
  template_key: string;
  payload_encrypted: string;
  payload_nonce: string;
};

type PasswordResetPayload = {
  reset_url: string;
  expires_minutes: number;
};

const genericForgotPasswordMessage =
  "If that address is in our system, you'll receive an email shortly.";

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

async function loginStaff(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function queryPasswordResetJobArgs(email: string) {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required to query River job args.");
  }

  const sql = `
    SELECT args::text
    FROM river_job
    WHERE kind = 'password_reset_email'
      AND args->>'to_address' = ${sqlLiteral(email)}
    ORDER BY id DESC
    LIMIT 1;
  `;

  return execFileSync("psql", [DATABASE_URL, "-t", "-A", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

async function waitForPasswordResetJobArgs(email: string) {
  const deadline = Date.now() + 20_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const raw = queryPasswordResetJobArgs(email);
      if (raw) {
        return JSON.parse(raw) as PasswordResetJobArgs;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for River reset job args. Last error: ${String(lastError)}`);
}

function decryptResetPayload(args: PasswordResetJobArgs) {
  if (!RESET_EMAIL_JOB_ENCRYPTION_KEY) {
    throw new Error("RESET_EMAIL_JOB_ENCRYPTION_KEY is required to decrypt River job args.");
  }

  const key = Buffer.from(RESET_EMAIL_JOB_ENCRYPTION_KEY, "base64");
  const nonce = Buffer.from(args.payload_nonce, "base64");
  const encrypted = Buffer.from(args.payload_encrypted, "base64");
  const authTag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as PasswordResetPayload;
}

test.describe("forgot-password public flow", () => {
  test("login links to forgot password and reset page stays public", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole("heading", { name: "Forgot password" })).toBeVisible();

    await page.goto("/reset-password?token=fake-token");
    await expect(page).toHaveURL(/\/reset-password\?token=fake-token$/);
    await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "New password", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Confirm new password" })).toBeVisible();
  });

  test("reset password validates length and confirmation before submitting", async ({ page }) => {
    await page.goto("/reset-password?token=fake-token");

    await page.getByRole("textbox", { name: "New password", exact: true }).fill("short");
    await expect(page.getByText("New password must be at least 12 characters.")).toBeVisible();

    await page.getByRole("textbox", { name: "New password", exact: true }).fill("ValidResetPassword123!");
    await page.getByRole("textbox", { name: "Confirm new password" }).fill("DifferentResetPassword123!");
    await expect(page.getByText("Password confirmation does not match.")).toBeVisible();
  });

  test("unknown forgot-password email receives generic success copy", async ({ page }) => {
    await page.goto("/forgot-password");

    await page.getByLabel("Email").fill(`unknown-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText(genericForgotPasswordMessage)).toBeVisible();
  });
});

test.describe("forgot-password API and reset semantics", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run live forgot-password tests."
  );

  test("known and unknown forgot-password requests return identical generic responses", async () => {
    const api = await playwrightRequest.newContext();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let superAdminToken = "";
    let user: CreatedUser | undefined;

    try {
      const superAdminSession = await loginApi(api, ADMIN_EMAIL!, ADMIN_PASSWORD!);
      superAdminToken = superAdminSession.token!;

      user = await createUser(api, superAdminToken, {
        first_name: "Forgot",
        last_name: "Known",
        email: `forgot-known-${suffix}@example.com`,
        password: `Initial-${suffix}-Password123!`,
        role: "USER",
      });

      const known = await api.post(`${API_BASE_URL}/forgot-password`, {
        data: { email: user.email },
      });
      expect(known.status()).toBe(200);
      await expect(known.json()).resolves.toMatchObject({
        message: genericForgotPasswordMessage,
      });

      const unknown = await api.post(`${API_BASE_URL}/forgot-password`, {
        data: { email: `forgot-unknown-${suffix}@example.com` },
      });
      expect(unknown.status()).toBe(200);
      await expect(unknown.json()).resolves.toMatchObject({
        message: genericForgotPasswordMessage,
      });
    } finally {
      if (superAdminToken) {
        await deleteUserIfPresent(api, superAdminToken, user?.user_id);
      }
      await api.dispose();
    }
  });

  test("full reset flow updates password and revokes the old session", async () => {
    test.skip(
      !DATABASE_URL || !RESET_EMAIL_JOB_ENCRYPTION_KEY,
      "Set PLAYWRIGHT_DATABASE_URL/DATABASE_URL and RESET_EMAIL_JOB_ENCRYPTION_KEY to run the full reset flow."
    );

    const api = await playwrightRequest.newContext();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let superAdminToken = "";
    let user: CreatedUser | undefined;

    try {
      const superAdminSession = await loginApi(api, ADMIN_EMAIL!, ADMIN_PASSWORD!);
      superAdminToken = superAdminSession.token!;
      const oldPassword = `Initial-${suffix}-Password123!`;
      const newPassword = `Changed-${suffix}-Password123!`;

      user = await createUser(api, superAdminToken, {
        first_name: "Forgot",
        last_name: "Reset",
        email: `forgot-reset-${suffix}@example.com`,
        password: oldPassword,
        role: "USER",
      });

      const userLogin = await api.post(`${API_BASE_URL}/login`, {
        data: { email: user.email, password: oldPassword },
      });
      expect(userLogin.status()).toBe(200);
      const userSession = (await userLogin.json()) as LoginResponse;
      expect(userSession.token).toBeTruthy();

      const forgotPassword = await api.post(`${API_BASE_URL}/forgot-password`, {
        data: { email: user.email },
      });
      expect(forgotPassword.status()).toBe(200);

      const args = await waitForPasswordResetJobArgs(user.email);
      expect(args.payload_encrypted).toBeTruthy();
      expect(JSON.stringify(args)).not.toContain("/reset-password?token=");

      const payload = decryptResetPayload(args);
      expect(payload.expires_minutes).toBe(15);
      const resetURL = new URL(payload.reset_url);
      const rawToken = resetURL.searchParams.get("token");
      expect(rawToken).toBeTruthy();

      const reset = await api.post(`${API_BASE_URL}/reset-password`, {
        data: { token: rawToken, new_password: newPassword },
      });
      expect(reset.status()).toBe(200);
      await expect(reset.json()).resolves.toMatchObject({
        message: "password reset successfully",
      });

      const oldPasswordLogin = await api.post(`${API_BASE_URL}/login`, {
        data: { email: user.email, password: oldPassword },
      });
      expect(oldPasswordLogin.status()).toBe(401);

      const newPasswordLogin = await api.post(`${API_BASE_URL}/login`, {
        data: { email: user.email, password: newPassword },
      });
      expect(newPasswordLogin.status()).toBe(200);

      const oldSession = await api.get(`${API_BASE_URL}/session`, {
        headers: { Authorization: `Bearer ${userSession.token}` },
      });
      expect(oldSession.status()).toBe(401);

      const reuseToken = await api.post(`${API_BASE_URL}/reset-password`, {
        data: { token: rawToken, new_password: `${newPassword}Again` },
      });
      expect(reuseToken.status()).toBe(400);
      await expect(reuseToken.json()).resolves.toMatchObject({
        error: "This link is invalid or has expired.",
      });
    } finally {
      if (superAdminToken) {
        await deleteUserIfPresent(api, superAdminToken, user?.user_id);
      }
      await api.dispose();
    }
  });
});

test.describe("forgot-password operational visibility", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to run jobs access tests."
  );

  test("Super Admin sees Background jobs and can load River UI", async ({ page }) => {
    await loginStaff(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/administration");
    await expect(page.getByRole("button", { name: "Background jobs" })).toBeVisible();

    await page.goto("/v1/admin/jobs");
    await expect(page).toHaveTitle(/River/);
    await expect(page.getByText("Jobs").first()).toBeVisible();
  });

  test("regular Admin cannot access River jobs", async ({ page }) => {
    const api = await playwrightRequest.newContext();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let superAdminToken = "";
    let admin: CreatedUser | undefined;

    try {
      const superAdminSession = await loginApi(api, ADMIN_EMAIL!, ADMIN_PASSWORD!);
      superAdminToken = superAdminSession.token!;
      const adminPassword = `Admin-${suffix}-Password123!`;

      admin = await createUser(api, superAdminToken, {
        first_name: "Jobs",
        last_name: "Admin",
        email: `jobs-admin-${suffix}@example.com`,
        password: adminPassword,
        role: "ADMIN",
      });

      const adminSession = await loginApi(api, admin.email, adminPassword);
      expect(adminSession.role).toBe("ADMIN");

      const directJobs = await api.get(`${API_BASE_URL}/admin/jobs`, {
        headers: { Authorization: `Bearer ${adminSession.token}` },
      });
      expect(directJobs.status()).toBe(403);

      await loginStaff(page, admin.email, adminPassword);
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goto("/administration");
      await expect(page.getByRole("button", { name: "Background jobs" })).toHaveCount(0);
    } finally {
      if (superAdminToken) {
        await deleteUserIfPresent(api, superAdminToken, admin?.user_id);
      }
      await api.dispose();
    }
  });
});
