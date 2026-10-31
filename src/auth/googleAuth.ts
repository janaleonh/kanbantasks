import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';

WebBrowser.maybeCompleteAuthSession();

// ────────────────────────────────────────────────────────────
// Google OAuth 2.0 Configuration
// ────────────────────────────────────────────────────────────
const CLIENT_ID_IOS =
  '957410363710-o0pllt9lsun0r806ogr3hcojrbnf7n72.apps.googleusercontent.com';
const REVERSED_CLIENT_ID =
  'com.googleusercontent.apps.957410363710-o0pllt9lsun0r806ogr3hcojrbnf7n72';
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/tasks',
];

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'google_access_token',
  REFRESH_TOKEN: 'google_refresh_token',
  EXPIRES_AT: 'google_expires_at',
  USER_EMAIL: 'google_user_email',
  USER_NAME: 'google_user_name',
};

export interface GoogleUser {
  email: string;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

// ── Discovery document ──────────────────────────────────────
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export function useGoogleAuth() {
  // Always use the reverse client ID scheme required by Google iOS OAuth
  // (never exp:// which Google rejects with OAuth 2.0 policy error)
  const redirectUri = `${REVERSED_CLIENT_ID}:/oauthredirect`;

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: CLIENT_ID_IOS,
      scopes: SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    discovery
  );

  return { request, response, promptAsync };
}

// ── Token exchange ──────────────────────────────────────────
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<AuthTokens> {
  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: CLIENT_ID_IOS,
      code,
      redirectUri,
      extraParams: { code_verifier: codeVerifier },
    },
    {
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    }
  );

  const tokens: AuthTokens = {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken ?? null,
    expiresAt: tokenResponse.expiresIn
      ? Date.now() + tokenResponse.expiresIn * 1000
      : Date.now() + 3600 * 1000,
  };

  await saveTokens(tokens);
  return tokens;
}

// ── Persist / load tokens ───────────────────────────────────
export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
  await SecureStore.setItemAsync(
    STORAGE_KEYS.REFRESH_TOKEN,
    tokens.refreshToken ?? ''
  );
  await SecureStore.setItemAsync(
    STORAGE_KEYS.EXPIRES_AT,
    tokens.expiresAt.toString()
  );
}

export async function loadTokens(): Promise<AuthTokens | null> {
  const accessToken = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
  const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
  const expiresAtStr = await SecureStore.getItemAsync(STORAGE_KEYS.EXPIRES_AT);

  if (!accessToken) return null;

  return {
    accessToken,
    refreshToken: refreshToken || null,
    expiresAt: expiresAtStr ? parseInt(expiresAtStr, 10) : 0,
  };
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.EXPIRES_AT);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_EMAIL);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_NAME);
}

// ── Token refresh ───────────────────────────────────────────
export async function refreshAccessToken(
  refreshToken: string
): Promise<AuthTokens> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID_IOS,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  const tokens: AuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  await saveTokens(tokens);
  return tokens;
}

// ── Get a valid (possibly refreshed) access token ──────────
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;

  // If token expires in less than 5 minutes, refresh it
  if (tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
    if (!tokens.refreshToken) return null;
    try {
      const fresh = await refreshAccessToken(tokens.refreshToken);
      return fresh.accessToken;
    } catch {
      return null;
    }
  }

  return tokens.accessToken;
}

// ── User info ───────────────────────────────────────────────
export async function fetchUserInfo(accessToken: string): Promise<GoogleUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user info');
  const data = await res.json();

  const user: GoogleUser = { email: data.email, name: data.name };
  await SecureStore.setItemAsync(STORAGE_KEYS.USER_EMAIL, user.email);
  await SecureStore.setItemAsync(STORAGE_KEYS.USER_NAME, user.name);
  return user;
}

export async function loadCachedUser(): Promise<GoogleUser | null> {
  const email = await SecureStore.getItemAsync(STORAGE_KEYS.USER_EMAIL);
  const name = await SecureStore.getItemAsync(STORAGE_KEYS.USER_NAME);
  if (!email) return null;
  return { email, name: name ?? email };
}
