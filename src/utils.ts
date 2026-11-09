import fs from 'node:fs';
export const initSql = fs.readFileSync(
  __dirname.replace('dist', '').replace('src', '') + 'init.sql',
  'utf-8',
);

export function createPostgresCredentials() {
  const user = `user_ffmpeglab_${Date.now()}`;
  const password = generateSecurePassword();
  const database = 'postgres';
  return { user, password, database };
}

export function createPostgresqlQueryForCredentials(creds: {
  user: string;
  password: string;
  database: string;
}) {
  return `
    CREATE USER ${creds.user} WITH PASSWORD '${creds.password}' CREATEDB;
    GRANT ALL on table public.render to ${creds.user};
    GRANT ALL on table public.pipeline to ${creds.user};
    GRANT ALL on table public.log_piece to ${creds.user};
    GRANT ALL on table public.api_key to ${creds.user};
    GRANT ALL ON SCHEMA PGMQ TO ${creds.user};
    GRANT ALL on table pgmq.q_renders to ${creds.user};
    GRANT ALL on table pgmq.q_render to ${creds.user};
    GRANT ALL on table pgmq.q_file to ${creds.user};
    GRANT ALL on table pgmq.q_logs to ${creds.user};
    GRANT ALL on table pgmq.a_renders to ${creds.user};
    GRANT ALL on table pgmq.a_render to ${creds.user};
    GRANT ALL on table pgmq.a_file to ${creds.user};
    GRANT ALL on table pgmq.a_logs to ${creds.user};
  `;
}

export function generateSecurePassword() {
  const array = new Uint32Array(10);
  return crypto.getRandomValues(array).join('').toString();
}

export function extractTokenFromHeader(request: Request): string | undefined {
  const auth =
    (request.headers as any).authorization ||
    request.headers.get('authorization');
  const token = auth.replace('Bearer ', '');
  return token;
}
