const SESSION_KEY = "authenticated";

export function getAuthenticatedSession(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

export function setAuthenticatedSession(value: string): void {
  sessionStorage.setItem(SESSION_KEY, value);
}

export function clearAuthenticatedSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function logout(): void {
  clearAuthenticatedSession();
  window.location.reload();
}
