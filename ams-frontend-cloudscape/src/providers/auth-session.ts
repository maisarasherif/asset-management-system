import type { AuthSession, LoginResponse } from "../types/ams";

export function sessionFromLoginResponse(response: LoginResponse): AuthSession {
	return {
		userId: response.user_id,
		firstName: response.first_name,
		lastName: response.last_name,
		email: response.email,
		role: response.role,
		status: response.status || "ACTIVE",
		expiresAt: response.expires_at,
		canManageUserPasswords: Boolean(response.can_manage_user_passwords),
	};
}
