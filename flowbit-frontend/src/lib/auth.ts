export const AUTH_COOKIE_NAME = "flowbit_session";
export const KEEP_SIGNED_IN_KEY = "flowbit.keepSignedIn";
export const AUTH_TOKEN_STORAGE_KEY = "flowbit.authToken";
export const AUTH_USER_STORAGE_KEY = "flowbit.authUser";
export const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

export function createAuthCookie(token: string, remember: boolean) {
    const maxAge = remember ? `; max-age=${THIRTY_DAYS_IN_SECONDS}` : "";
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; path=/${maxAge}; SameSite=Lax`;
}

export function clearAuthCookie() {
  return `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
