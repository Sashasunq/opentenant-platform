import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as vault from 'vault-client-typescript';
import { vaultClientConfig } from '../config';
import {
  CreatePipelineDTO,
  PipelineConfig,
  RepoSession,
  UpdatePipelineDTO,
  Platform,
} from '../types';
import { getGitAdapter, DirEntry } from '../git/git-clients';
import ClientOAuth2 from 'client-oauth2';
import { createInstallationAccessToken } from '../git/github-auth';
import { gitlabOAuthClient } from '../git/gitlab-auth';
import { AppService } from '../supabase/supabase.service'; // <-- import AppService

const secretsClient = new vault.SecretsApi(vaultClientConfig);

// repoFullName contains "/", which Vault treats as a path separator.
// We encode it so each pipeline is a single flat key under pipelines/<userId>/
// and can be reconstructed exactly from kvV2List output.
function encodeRepoKey(repoFullName: string): string {
  return Buffer.from(repoFullName, 'utf-8').toString('base64url');
}

function decodeRepoKey(key: string): string {
  return Buffer.from(key, 'base64').toString('utf-8');
}

@Injectable()
export class PipelineService {
  // ---- inject AppService ----
  constructor(private readonly appService: AppService) {}

  // ---- session handling ----
  async getSessionForUser(
    userId: string,
    platform: string,
  ): Promise<RepoSession> {
    // For GitHub, prefer installation token if available
    if (platform === 'github') {
      try {
        const token = await this.getInstallationTokenForUser(userId);
        return {
          accessToken: token,
          created: Date.now(),
          expires: 3600,
        } as RepoSession;
      } catch {
        // fall through to OAuth session
      }
    }

    const session = (
      await secretsClient.kvV2Read(
        `users/${userId}/${platform}-session`,
        'secret',
      )
    ).data as RepoSession;
    if (Date.now() > session.created + session.expires * 1000) {
      throw new BadRequestException(`${platform}_session_expired`);
    }
    return session;
  }

  private kvPath(userId: string, repoFullName: string) {
    return `pipelines/${userId}/${encodeRepoKey(repoFullName)}`;
  }

  // ---- repo index ----
  private repoIndexPath(repoFullName: string) {
    return `pipelines/repoIndex/${encodeRepoKey(repoFullName)}`;
  }

  async getUserIdByRepo(repoFullName: string): Promise<string | undefined> {
    try {
      const data = (
        await secretsClient.kvV2Read(this.repoIndexPath(repoFullName), 'secret')
      ).data as { userId: string };
      return data.userId;
    } catch {
      return undefined;
    }
  }

  // ---- whoami ----
  async whoami(userId: string): Promise<{
    login: string;
    provider: 'github' | 'gitlab';
    avatar_url?: string;
  }> {
    for (const platform of ['github', 'gitlab'] as const) {
      try {
        const session = await this.getSessionForUser(userId, platform);
        const adapter = getGitAdapter(platform);
        const profile = await adapter.getProfile(session.accessToken);
        return { ...profile, provider: platform };
      } catch {
        // try next platform
      }
    }
    throw new UnauthorizedException('no_git_session');
  }

  // ---- get contents ----
  async getContents(
    userId: string,
    platform: Platform,
    repoFullName: string,
    path: string,
    ref: string,
  ): Promise<DirEntry[]> {
    const session = await this.getSessionForUser(userId, platform);
    const adapter = getGitAdapter(platform);
    return adapter.getContents(session.accessToken, repoFullName, path, ref);
  }

  // ---- attach pipeline ----
  async attachPipeline(
    userId: string,
    body: CreatePipelineDTO,
  ): Promise<PipelineConfig> {
    const session = await this.getSessionForUser(userId, body.platform);
    const adapter = getGitAdapter(body.platform);

    // verify repo access
    await adapter.getRepo(session.accessToken, body.repoFullName);

    // verify the pipeline file actually exists at the given path/ref
    const file = await adapter.getFile(
      session.accessToken,
      body.repoFullName,
      body.path,
      body.ref,
    );
    if (!file.exists) {
      throw new NotFoundException(
        `pipeline_file_not_found:${body.path}@${body.ref}`,
      );
    }

    // guard against attaching the same repo twice
    const existing = await this.getPipeline(userId, body.projectId);
    if (existing) {
      throw new BadRequestException('pipeline_already_attached');
    }

    const now = Date.now();
    const config: PipelineConfig = {
      id: randomUUID(),
      repoFullName: body.repoFullName,
      platform: body.platform,
      path: body.path,
      ref: body.ref,
      projectId: body.projectId,
      status: 'on',
      createdAt: now,
      updatedAt: now,
      lastCommitSha: file.sha,
    };

    await secretsClient.kvV2Write(
      this.kvPath(userId, body.projectId),
      'secret',
      {
        data: config,
      },
    );
    // Write the index
    await secretsClient.kvV2Write(
      this.repoIndexPath(body.repoFullName),
      'secret',
      { data: { userId } },
    );

    return config;
  }

  async updatePipeline(
    userId: string,
    projectId: string,
    body: UpdatePipelineDTO,
  ): Promise<PipelineConfig | undefined> {
    const config = await this.getPipeline(userId, projectId);
    if (!config) throw new NotFoundException('pipeline_not_found');

    const next = { ...config, ...body, updatedAt: Date.now() };

    // re-validate path/ref changes against the remote
    if (body.path || body.ref) {
      const session = await this.getSessionForUser(userId, config.platform);
      const adapter = getGitAdapter(config.platform);
      const file = await adapter.getFile(
        session.accessToken,
        next.repoFullName,
        next.path,
        next.ref,
      );
      if (!file.exists)
        throw new NotFoundException(
          `pipeline_file_not_found:${next.path}@${next.ref}`,
        );
      next.lastCommitSha = file.sha;
    }

    await secretsClient.kvV2Write(this.kvPath(userId, projectId), 'secret', {
      data: next,
    });
    return next;
  }

  async getPipeline(
    userId: string,
    projectId: string,
  ): Promise<PipelineConfig | undefined> {
    try {
      return (
        await secretsClient.kvV2Read(this.kvPath(userId, projectId), 'secret')
      ).data as PipelineConfig;
    } catch {
      return undefined;
    }
  }

  async detachPipeline(userId: string, projectId: string) {
    const config = await this.getPipeline(userId, projectId);
    if (!config) throw new NotFoundException('pipeline_not_found');
    await secretsClient.kvV2Delete(this.kvPath(userId, projectId), 'secret');
    // Delete the index
    await secretsClient.kvV2Delete(this.repoIndexPath(projectId), 'secret');
    return { detached: true };
  }

  async listPipelinesForUser(userId: string): Promise<PipelineConfig[]> {
    const keys =
      (
        await secretsClient.kvV2List(
          `pipelines/${userId}`,
          'secret',
          vault.SecretsApiKvV2ListListEnum.TRUE,
        )
      ).keys ?? [];
    const configs = await Promise.all(
      keys.map(async (k) => {
        try {
          return (
            await secretsClient.kvV2Read(`pipelines/${userId}/${k}`, 'secret')
          ).data as PipelineConfig;
        } catch {
          return undefined;
        }
      }),
    );
    return configs.filter(Boolean) as PipelineConfig[];
  }

  // ---- webhook: apply migration ----
  async applyMigrationFromWebhook(
    repoFullName: string,
    commitSha: string,
  ): Promise<void> {
    // 1. Look up userId
    const userId = await this.getUserIdByRepo(repoFullName);
    if (!userId)
      throw new NotFoundException('No pipeline found for this repository');

    // 2. Get pipeline config
    const pipelines = await this.listPipelinesForUser(userId);

    const config = pipelines.find((pipe) => pipe.repoFullName === repoFullName);

    if (!config) throw new NotFoundException('Pipeline config not found');

    if (config.status === 'off') throw new Error('Pipeline is disabled');

    // 3. Get the Git session and adapter
    const session = await this.getSessionForUser(userId, config.platform);
    const adapter = getGitAdapter(config.platform);

    // 4. Fetch the migration file at the given path and ref (which is the branch)
    const file = await adapter.getFile(
      session.accessToken,
      repoFullName,
      config.path,
      config.ref,
    );
    if (!file.exists)
      throw new NotFoundException(`Migration file not found at ${config.path}`);

    // 5. Apply the migration using AppService
    await this.appService.applyMigration(userId, {
      projectId: config.projectId,
      sql: file.content,
      name: `webhook-${commitSha}`,
    });

    // 6. Update lastCommitSha
    config.lastCommitSha = commitSha;
    await secretsClient.kvV2Write(this.kvPath(userId, repoFullName), 'secret', {
      data: config,
    });
  }

  // ---- session storage ----
  async saveGitHubSession(userId: string, oauthSession: ClientOAuth2.Token) {
    const session: RepoSession & { refreshToken?: string } = {
      accessToken: oauthSession.accessToken,
      refreshToken: oauthSession.refreshToken ?? undefined,
      created: Date.now(),
      expires: parseInt(process.env.GITHUB_TOKEN_EXPIRE_TIME ?? '28800', 10),
    };
    await secretsClient.kvV2Write(`users/${userId}/github-session`, 'secret', {
      data: { ...session, access_token: oauthSession.accessToken },
    });
    return session;
  }

  async saveInstallation(
    userId: string,
    installationId: number,
    installationToken: string,
  ) {
    await secretsClient.kvV2Write(
      `users/${userId}/github-installation`,
      'secret',
      {
        data: {
          installationId,
          installationToken,
          created: Date.now(),
          expires: 3600,
        },
      },
    );
  }

  async getInstallationTokenForUser(userId: string): Promise<string> {
    try {
      const inst = (
        await secretsClient.kvV2Read(
          `users/${userId}/github-installation`,
          'secret',
        )
      ).data as {
        installationId: number;
        installationToken: string;
        created: number;
      };
      if (Date.now() < inst.created + 3600_000) return inst.installationToken;
      // refresh
      const fresh = await createInstallationAccessToken(inst.installationId);
      await this.saveInstallation(userId, inst.installationId, fresh);
      return fresh;
    } catch (err) {
      throw new BadRequestException('github_app_not_installed');
    }
  }

  async saveGitLabSession(userId: string, oauthSession: ClientOAuth2.Token) {
    const session: RepoSession & { refreshToken?: string } = {
      accessToken: oauthSession.accessToken,
      refreshToken: oauthSession.refreshToken ?? undefined,
      created: Date.now(),
      expires: parseInt(process.env.GITLAB_TOKEN_EXPIRE_TIME ?? '7200', 10),
    };
    await secretsClient.kvV2Write(`users/${userId}/gitlab-session`, 'secret', {
      data: {
        ...session,
        access_token: oauthSession.accessToken,
        refresh_token: oauthSession.refreshToken,
      },
    });
    return session;
  }

  async getFreshGitLabSession(userId: string): Promise<RepoSession> {
    let session: RepoSession & { refreshToken?: string };

    try {
      session = (
        await secretsClient.kvV2Read(`users/${userId}/gitlab-session`, 'secret')
      ).data as unknown as RepoSession & { refreshToken?: string };
    } catch {
      throw new BadRequestException('gitlab_not_connected');
    }

    if (!session?.accessToken) {
      throw new BadRequestException('gitlab_not_connected');
    }

    const refreshed = await gitlabOAuthClient
      .createToken(session.accessToken, session.refreshToken as any)
      .refresh();

    return this.saveGitLabSession(userId, refreshed);
  }
}
