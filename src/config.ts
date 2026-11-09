import * as vault from 'vault-client-typescript';
import { Users } from './model/user.entity';

export const SUPABASE_PLATFORM = 'https://api.supabase.com/';

export const PLATFORM_HOST = process.env.PLATFORM_HOST as string;
export const WEBAPP_BASE = process.env.WEBAPP_HOST as string; // e.g. https://webapp.ffmpeglab.com/webapp

export const config = {
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [Users],
    synchronize: false,
  },
  clientId: process.env.SUPA_CONNECT_CLIENT_ID,
  clientSecret: process.env.SUPA_CONNECT_CLIENT_SECRET,
  authorizationUri: 'https://api.supabase.com/v1/oauth/authorize',
  accessTokenUri: 'https://api.supabase.com/v1/oauth/token',
  redirectUri: PLATFORM_HOST + '/platform/oauth2/callback',
  supabaseConnectRedirect:
    process.env.WEBAPP_HOST + '/pipelines?showPipelineTemplates=true',
  gitConnectRedirect: process.env.WEBAPP_HOST + '/editor',
};

export const TENANT_WORKER_LOGIN = 'worker@ffmpeglab.com';
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env
  .SUPABASE_PUBLISHABLE_KEY as string;
export const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY as string;
export const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL as string;

export const FFMPEGLAB_PLATFORM_PORT =
  process.env.FFMPEGLAB_PLATFORM_PORT ?? 7001;

export const organizationsUri = SUPABASE_PLATFORM + 'v1/organizations';

export const profileUri = SUPABASE_PLATFORM + 'v1/profile';

export const vaultClientConfig = new vault.Configuration({
  basePath: process.env.VAULT_URL,
  headers: {
    'X-Vault-Token': process.env.VAULT_TOKEN as string,
  },
});

export const supabaseEnv = {
  url: SUPABASE_URL,
  publishableKeys: {
    default: SUPABASE_PUBLISHABLE_KEY,
  },
  secretKeys: { default: SUPABASE_SECRET_KEY as string },
  jwks: new URL(SUPABASE_JWKS_URL as string),
};

export default {};
