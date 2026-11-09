import { V1ProjectWithDatabaseResponseStatus } from 'supabase-management-js';
import { getProject } from './supabase/supabase';
import { ApiProperty } from '@nestjs/swagger';

export class SupabaseSession {
  @ApiProperty()
  created: number;
  @ApiProperty()
  expires: number;
  @ApiProperty()
  refresh_token: string;
  @ApiProperty()
  refreshToken?: string;
  @ApiProperty()
  accessToken?: string;
  @ApiProperty()
  access_token: string;
}

export class applyMigrationDTO {
  @ApiProperty()
  projectId: string;
  @ApiProperty()
  sql: string;
  @ApiProperty()
  name: string;
}

export interface SupabaseTenant extends Awaited<ReturnType<typeof getProject>> {
  id: string;
  created: number;
  updated: number;
  user: string;
  ffmpeglabStatus: 'on' | 'off';
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  DB_HOST: string;
  DB_USER: string;
  DB_PORT: number;
  DB_PASSWORD: string;
  DB_NAME: string;
  TENANT_SECRET_KEY: string;
  TENANT_SERVICE_KEY: string;
  TENANT_USER_ID: string;
  TENANT_WORKER_LOGIN: string;
  SUPABASE_ANON_KEY: string;
  PLATFORM_HOST: string;
  S3_REGION: string;
  SUPABASE_HOST: string;
  S3_ENDPOINT: string;
  IS_SUPABASE_PLATFORM: boolean;
  PIPELINES_API_ENABLED: boolean;
  SUPABASE_PROJECT_ID: string;
}

export class ConnectResponseDTO {
  @ApiProperty()
  status: 'on' | 'off';
  @ApiProperty()
  error: string;
}

export interface SupabaseProfile {
  gotrue_id: string;
  primary_email: string;
  username: string;
}

export class ConnectRedirectResponseDTO {
  @ApiProperty()
  redirectUri: string;
}

export class SupabaseTenantDTO implements Omit<
  SupabaseTenant,
  | 'db'
  | 'DB_HOST'
  | 'DB_USER'
  | 'DB_PORT'
  | 'DB_PASSWORD'
  | 'DB_NAME'
  | 'database'
  | 'organization_id'
  | 'organization_slug'
  | '(Missing)'
  | 'TENANT_SERVICE_KEY'
  | 'TENANT_SECRET_KEY'
  | 'TENANT_USER_ID'
  | 'TENANT_WORKER_LOGIN'
  | 'SUPABASE_ANON_KEY'
  | 'PLATFORM_HOST'
  | 'S3_REGION'
  | 'S3_ENDPOINT'
  | 'IS_SUPABASE_PLATFORM'
  | 'SUPABASE_HOST'
  | 'SUPABASE_PROJECT_ID'
  | 'PIPELINES_API_ENABLED'
> {
  @ApiProperty()
  id: string;
  @ApiProperty()
  created: number;
  @ApiProperty()
  updated: number;
  @ApiProperty()
  user: string;
  @ApiProperty()
  ffmpeglabStatus: 'on' | 'off';
  @ApiProperty()
  region: string;
  @ApiProperty()
  ref: string;
  @ApiProperty({ enum: V1ProjectWithDatabaseResponseStatus })
  status: V1ProjectWithDatabaseResponseStatus;
  @ApiProperty()
  name: string;
  @ApiProperty()
  created_at: string;
}

export type Platform = 'github' | 'gitlab';

export interface PipelineConfig {
  id: string;
  repoFullName: string; // e.g. "owner/repo" or "group/project"
  platform: Platform;
  path: string; // path inside the repo e.g. ".ffmpeglab/pipeline.yml"
  ref: string; // branch/tag
  projectId: string; // Supabase project ID to apply migrations to
  status: 'on' | 'off';
  createdAt: number;
  updatedAt: number;
  lastCommitSha?: string;
}

export interface RepoSession {
  accessToken: string;
  refreshToken?: string;
  created: number;
  expires: number;
}

export class CreatePipelineDTO {
  @ApiProperty()
  platform: Platform;
  @ApiProperty({ example: 'acme/video-api' })
  repoFullName: string;
  @ApiProperty({
    example: '.ffmpeglab/pipeline.yml',
    description: 'Path of the pipeline definition inside the repository',
  })
  path: string;
  @ApiProperty({ example: 'main' })
  ref: string;
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  projectId: string;
}
export class UpdatePipelineDTO {
  @ApiProperty({ required: false })
  path?: string;
  @ApiProperty({ required: false })
  ref?: string;
  @ApiProperty({ enum: ['on', 'off'], required: false })
  status?: 'on' | 'off';
}
export interface GitHubInstallation {
  installationId: number;
  installationToken: string;
  created: number;
}
