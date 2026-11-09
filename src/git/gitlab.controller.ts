import {
  Controller,
  Get,
  Query,
  Request,
  Response,
  Session,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { withSupabase, SupabaseCtx } from '@supabase/server/adapters/nestjs';
import type { SupabaseContext } from '@supabase/server';
import { User } from '@supabase/supabase-js';
import * as crypto from 'crypto';

import { supabaseEnv, config, WEBAPP_BASE } from '../config';
import { ConnectRedirectResponseDTO } from '../types';
import { PipelineService } from '../pipelines/pipeline.service';
import { GITLAB_HOST, gitlabOAuthClient } from './gitlab-auth';

@Controller('git')
@UseGuards(
  withSupabase({
    auth: 'none',
    env: supabaseEnv,
  }),
)
export class GitlabLoginController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get('login/gitlab')
  @ApiResponse({ type: ConnectRedirectResponseDTO })
  gitlabLogin(@Session() session: Record<string, any>): {
    redirectUri: string;
  } {
    const state = crypto.randomUUID();
    session.gitlabState = state;
    const uri = gitlabOAuthClient.code.getUri() + `&state=${state}`;
    return { redirectUri: uri };
  }

  @Get('login/gitlab/redirect')
  @ApiResponse({ type: ConnectRedirectResponseDTO })
  gitlabLoginRedirect(
    @Query('redirectTo') redirectTo: string | undefined,
    @Session() session: Record<string, any>,
    @Response() response,
  ): void {
    session.gitlabRedirectTo =
      redirectTo && redirectTo.startsWith('/') ? redirectTo : undefined;
    session.gitlabState = crypto.randomUUID();
    response.redirect(
      gitlabOAuthClient.code.getUri() + `&state=${session.gitlabState}`,
    );
  }

  @Get('login/gitlab/callback')
  async gitlabCallback(
    @Request() req,
    @Query('state') state: string | undefined,
    @Response() response,
    @Session() session: Record<string, any>,
    @SupabaseCtx() ctx: SupabaseContext,
  ): Promise<void | { error: string }> {
    try {
      if (!session.gitlabState || state !== session.gitlabState) {
        throw new Error('invalid_state');
      }
      delete session.gitlabState;

      const oauthSession = await gitlabOAuthClient.code.getToken(req.url);
      if (!oauthSession.accessToken) throw new Error('invalid_tokens');

      const glRes = await fetch(`${GITLAB_HOST}/api/v4/user`, {
        headers: { Authorization: `Bearer ${oauthSession.accessToken}` },
      });
      const profile = await glRes.json();
      const email = profile.email;
      if (!email) throw new Error('no_email');

      console.log('[gitlab/callback] profile:', profile);

      const {
        data: { users },
      } = await ctx.supabaseAdmin.auth.admin.listUsers();

      let userId = users.find((u: User) => u.email === email)?.id;

      if (!userId) {
        const { data: newUser, error } =
          await ctx.supabaseAdmin.auth.admin.createUser({
            email,
            user_metadata: {
              name: profile.name,
              gitlab_login: profile.username,
            },
          });
        if (error) throw error;
        userId = newUser.user.id;
      }

      await this.pipelineService.saveGitLabSession(userId, oauthSession);

      // Redirect: dynamic if projectRedirect exists
      const projectId = session.projectRedirect;
      delete session.projectRedirect;

      let redirectUrl: string;
      if (projectId) {
        redirectUrl = `${WEBAPP_BASE}/pipelines/pipeline/${projectId}/settings?gitlab=connected`;
        console.log(
          `[gitlab/callback] 🔀 Redirecting to project settings: ${redirectUrl}`,
        );
      } else {
        redirectUrl = `${config.webAppRedirect}?gitlab=connected`;
        console.log(
          `[gitlab/callback] 🔀 Redirecting to default: ${redirectUrl}`,
        );
      }

      return response.redirect(redirectUrl);
    } catch (err) {
      console.error('[gitlab/callback] error:', err);
      response.redirect(
        `${config.webAppRedirect}?status=error&reason=${encodeURIComponent(String(err))}`,
      );
    }
  }

  @Get('login/gitlab/disconnect')
  async disconnect(
    @Session() session: Record<string, any>,
    @SupabaseCtx() ctx: SupabaseContext,
  ) {
    if (!session.user) return { status: 'not_connected' };
    try {
      const s = await this.pipelineService.getSessionForUser(
        session.user,
        'gitlab',
      );
      await fetch(`${GITLAB_HOST}/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: s.accessToken,
          client_id: process.env.GITLAB_CLIENT_ID,
          client_secret: process.env.GITLAB_CLIENT_SECRET,
        }),
      });
    } catch {
      // already expired / revoked
    }
    return { status: 'disconnected' };
  }
}
