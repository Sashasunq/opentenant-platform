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

import { supabaseEnv, config, WEBAPP_BASE } from '../config';
import { ConnectRedirectResponseDTO } from '../types';
import {
  GITHUB_APP_SLUG,
  createInstallationAccessToken,
  githubOAuthClient,
} from './github-auth';
import { GithubService } from './github.service';

@Controller('git')
@UseGuards(
  withSupabase({
    auth: 'none',
    env: supabaseEnv,
  }),
)
export class GithubLoginController {
  constructor(private readonly service: GithubService) {}

  @Get('login/github')
  @ApiResponse({ type: ConnectRedirectResponseDTO })
  gitHubLogin(): { redirectUri: string } {
    const uri = githubOAuthClient.code.getUri() + '&allow_signup=true';
    return { redirectUri: uri };
  }

  @Get('login/github/redirect')
  @ApiResponse({ type: ConnectRedirectResponseDTO })
  gitHubLoginRedirect(
    @Query('redirectTo') redirectTo: string | undefined,
    @Response() response,
  ): void {
    response.redirect(githubOAuthClient.code.getUri() + '&allow_signup=true');
  }

  @Get('login/github/install')
  installApp(@Response() response): void {
    response.redirect(
      `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`,
    );
  }

  @Get('login/callback')
  async githubCallback(
    @Request() req,
    @Response() response,
    @Session() session: Record<string, any>,
    @SupabaseCtx() ctx: SupabaseContext,
  ): Promise<void | { error: string }> {
    try {
      await this.service.loginCallback(req.url, ctx);
      const projectId = session.projectRedirect;
      delete session.projectRedirect; // clean up

      let redirectUrl: string;
      if (projectId) {
        redirectUrl = `${WEBAPP_BASE}/pipelines/pipeline/${projectId}/settings?github=connected`;
        console.log(
          `[github/callback] 🔀 Redirecting to project settings: ${redirectUrl}`,
        );
      } else {
        redirectUrl = `${config.webAppRedirect}?github=connected`;
        console.log(
          `[github/callback] 🔀 Redirecting to default: ${redirectUrl}`,
        );
      }
      return response.redirect(redirectUrl);
    } catch (err) {
      console.error('[github/callback] ❌ Error:', err);
      response.redirect(
        `${config.webAppRedirect}?status=error&reason=${encodeURIComponent(String(err))}`,
      );
    }
  }

  @Get('login/installation/callback')
  async installationCallback(
    @Query('installation_id') installationId: string,
    @Query('setup_action') setupAction: string,
    @SupabaseCtx() ctx: SupabaseContext,
  ): Promise<{ status: string; installed: boolean }> {
    if (!installationId || setupAction !== 'install') {
      return { status: 'cancelled', installed: false };
    }
    throw new Error('installation_callback_needs_frontend_link');
  }
}
