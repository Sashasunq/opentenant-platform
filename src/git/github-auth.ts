import ClientOAuth2 from 'client-oauth2';
import jwt from 'jsonwebtoken';
import { PLATFORM_HOST } from '../config';
import * as fs from 'fs';
import * as path from 'path';

// ── GitHub App credentials ──────────────────────────────────────────
export const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG as string; // e.g. "ffmpeglab"
export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID as string;
export const GITHUB_APP_ID = process.env.GITHUB_APP_ID as string;

let cachedPrivateKey: string | null = null;

function getPrivateKey(): string {
  if (cachedPrivateKey) return cachedPrivateKey;

  // 1. Prefer reading from a file path
  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  if (keyPath) {
    try {
      const key = fs.readFileSync(keyPath, 'utf8').replace(/\\n/g, '\n');
      cachedPrivateKey = key;
      return key;
    } catch (err) {
      console.error(`Failed to read private key from ${keyPath}:`, err);
      throw new Error(
        'GITHUB_APP_PRIVATE_KEY_PATH is set but file could not be read',
      );
    }
  }

  // 2. Fallback to environment variable
  const key = (process.env.GITHUB_APP_PRIVATE_KEY as string)?.replace(
    /\\n/g,
    '\n',
  );
  if (!key) {
    throw new Error(
      'Neither GITHUB_APP_PRIVATE_KEY_PATH nor GITHUB_APP_PRIVATE_KEY is set',
    );
  }
  cachedPrivateKey = key;
  return key;
}

// OAuth web-app flow client (user access tokens)
export const githubOAuthClient = new ClientOAuth2({
  clientId: GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
  accessTokenUri: 'https://github.com/login/oauth/access_token',
  authorizationUri: 'https://github.com/login/oauth/authorize',
  redirectUri: `${PLATFORM_HOST}/git/login/callback`,
  scopes: ['repo', 'read:user', 'user:email'],
});

// Cache the App JWT for a few minutes — signing on every request is wasteful
// and GitHub rejects tokens with identical `iat` issued too frequently anyway.
let cachedAppJwt: { token: string; issuedAt: number } | null = null;

// Generate a short-lived JWT to act as the GitHub App itself
export function createAppJWT(): string {
  const now = Math.floor(Date.now() / 1000);

  // reuse a token until it's 5 minutes old (still well under GitHub's 10 min cap)
  if (cachedAppJwt && now - cachedAppJwt.issuedAt < 5 * 60) {
    return cachedAppJwt.token;
  }

  const privateKey = getPrivateKey();
  const payload = {
    iat: now - 60,
    exp: now + 9 * 60, // max 10 min
  };
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    issuer: GITHUB_APP_ID,
  });
  cachedAppJwt = { token, issuedAt: now };
  return token;
}

// Exchange installation_id → an installation-scoped token
export async function createInstallationAccessToken(
  installationId: number,
): Promise<string> {
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${createAppJWT()}`,
        Accept: 'application/vnd.github+json',
      },
    },
  );
  if (!res.ok) {
    throw new Error(`github_install_token_error:${res.status}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}
