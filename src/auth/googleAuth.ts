import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { rememberTaskAccount } from './taskAccount';

WebBrowser.maybeCompleteAuthSession();

let authVersion = 0;
let tokenWrites: Promise<void> = Promise.resolve();
export const getAuthVersion = () => authVersion;
const assertAuth = (version: number) => { if (version !== authVersion) throw new Error('Die Google-Anmeldung wurde geändert. Bitte versuche es erneut.'); };

function writeAuth(version: number, work: () => Promise<void>) {
  const writing = tokenWrites.catch(() => {}).then(async () => { assertAuth(version); await work(); assertAuth(version); });
  tokenWrites = writing;
  return writing;
}

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
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'google_access_token',
  REFRESH_TOKEN: 'google_refresh_token',
  EXPIRES_AT: 'google_expires_at',
  USER_EMAIL: 'google_user_email',
  USER_NAME: 'google_user_name',
};

const TOKEN_STORAGE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
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
      extraParams: { prompt: 'consent' },
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
  const version = ++authVersion;
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

  assertAuth(version);
  await persistTokens(tokens, version, true);
  return tokens;
}

// ── Persist / load tokens ───────────────────────────────────
export async function saveTokens(tokens: AuthTokens): Promise<void> {
  return persistTokens(tokens, ++authVersion, true);
}

async function persistTokens(tokens: AuthTokens, version: number, newLogin = false): Promise<void> {
  return writeAuth(version, async () => {
  if (newLogin) {
    await rememberTaskAccount(await SecureStore.getItemAsync(STORAGE_KEYS.USER_EMAIL));
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_EMAIL);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_NAME);
  }
  await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken, TOKEN_STORAGE_OPTIONS);
  await SecureStore.setItemAsync(
    STORAGE_KEYS.REFRESH_TOKEN,
    tokens.refreshToken ?? '',
    TOKEN_STORAGE_OPTIONS
  );
  await SecureStore.setItemAsync(
    STORAGE_KEYS.EXPIRES_AT,
    tokens.expiresAt.toString(),
    TOKEN_STORAGE_OPTIONS
  );
  });
}

export async function loadTokens(): Promise<AuthTokens | null> {
  await tokenWrites.catch(() => {});
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
  const version = ++authVersion;
  return writeAuth(version, async () => {
  await rememberTaskAccount(await SecureStore.getItemAsync(STORAGE_KEYS.USER_EMAIL)).catch(() => {});
  await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.EXPIRES_AT);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_EMAIL);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_NAME);
  });
}

// ── Token refresh ───────────────────────────────────────────
export async function refreshAccessToken(
  refreshToken: string
): Promise<AuthTokens> {
  const version = authVersion;
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

  assertAuth(version);
  await persistTokens(tokens, version);
  return tokens;
}

// ── Get a valid (possibly refreshed) access token ──────────
export async function getValidAccessToken(): Promise<string | null> {
  const version = authVersion;
  const tokens = await loadTokens();
  if (!tokens || !(await loadCachedUser()) || version !== authVersion || !Number.isFinite(tokens.expiresAt)) return null;

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
  const version = authVersion;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user info');
  const data = await res.json();
  assertAuth(version);
  if (typeof data.email !== 'string' || !data.email.trim() || data.email_verified !== true) throw new Error('Das Google-Konto konnte nicht eindeutig bestätigt werden.');
  const user: GoogleUser = { email: data.email, name: typeof data.name === 'string' ? data.name : data.email };
  await writeAuth(version, async () => {
  await rememberTaskAccount(await SecureStore.getItemAsync(STORAGE_KEYS.USER_EMAIL));
  await rememberTaskAccount(user.email);
  await SecureStore.setItemAsync(STORAGE_KEYS.USER_EMAIL, user.email);
  await SecureStore.setItemAsync(STORAGE_KEYS.USER_NAME, user.name);
  });
  return user;
}

export async function loadCachedUser(): Promise<GoogleUser | null> {
  await tokenWrites.catch(() => {});
  const email = await SecureStore.getItemAsync(STORAGE_KEYS.USER_EMAIL);
  const name = await SecureStore.getItemAsync(STORAGE_KEYS.USER_NAME);
  if (!email) return null;
  return { email, name: name ?? email };
}
