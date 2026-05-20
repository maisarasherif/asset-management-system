export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type ResponseMode = "json" | "blob" | "void";

interface RequestOptions {
  auth?: boolean;
  responseMode?: ResponseMode;
}

const API_BASE_URL = (
	import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
).replace(/\/$/, "");

let unauthorizedHandler: (() => void) | null = null;

export function configureApiClient(config: {
	onUnauthorized: () => void;
}) {
	unauthorizedHandler = config.onUnauthorized;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  if (contentType.startsWith("text/")) {
    return response.text();
  }

  return null;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
): Promise<T> {
  const auth = options.auth ?? true;
  const responseMode = options.responseMode ?? "json";
	const headers = new Headers(init.headers);
	const body = init.body;

	if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const response = await fetch(`${API_BASE_URL}${path}`, {
		...init,
		credentials: "include",
		headers,
	});

  if (response.status === 401 && auth) {
    unauthorizedHandler?.();
    throw new ApiError("Session expired. Please sign in again.", 401, null);
  }

  if (!response.ok) {
    const errorBody = await parseBody(response);
    const message =
      (typeof errorBody === "object" &&
      errorBody !== null &&
      "error" in errorBody &&
      typeof errorBody.error === "string"
        ? errorBody.error
        : null) ||
      (typeof errorBody === "string" ? errorBody : null) ||
      `Request failed (${response.status})`;

    throw new ApiError(message, response.status, errorBody);
  }

  if (responseMode === "void") {
    return undefined as T;
  }

  if (responseMode === "blob") {
    return (await response.blob()) as T;
  }

  return (await parseBody(response)) as T;
}
