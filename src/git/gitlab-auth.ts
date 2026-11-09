import { randomUUID } from 'crypto';
import ClientOAuth2 from 'client-oauth2';
import { PLATFORM_HOST } from '../config';

// Allow self-hosted GitLab instances
export const GITLAB_HOST = process.env.GITLAB_HOST ?? 'https://gitlab.com';

export const GITLAB_SCOPES = [
  'api',
  'read_user',
  'read_repository',
  'write_repository',
];

export const gitlabOAuthClient = new ClientOAuth2({
  clientId: process.env.GITLAB_CLIENT_ID as string,
  clientSecret: process.env.GITLAB_CLIENT_SECRET as string,
  accessTokenUri: `${GITLAB_HOST}/oauth/token`,
  authorizationUri: `${GITLAB_HOST}/oauth/authorize`,
  redirectUri: `${PLATFORM_HOST}/git/login/gitlab/callback`,
  scopes: GITLAB_SCOPES,
  // NOTE: no `state` here — it's generated per-request in the controllers
  // (gitlabLogin / gitlabLoginRedirect) and verified in the callback.
});
