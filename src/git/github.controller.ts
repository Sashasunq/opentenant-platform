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

import { supabaseEnv, config, WEBAPP_BASE } from '../config';
import { ConnectRedirectResponseDTO } from '../types';
import { PipelineService } from '../pipelines/pipeline.service';
import {
  GITHUB_APP_SLUG,
  createInstallationAccessToken,
  githubOAuthClient,
} from './github-auth';

@Controller('git')
@UseGuards(
  withSupabase({
    auth: 'none',
    env: supabaseEnv,
  }),
)
export class GithubLoginController {
  constructor(private readonly pipelineService: PipelineService) {}

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
      console.log('[github/callback] ⏳ Exchanging code...');
      const oauthSession = await githubOAuthClient.code.getToken(req.url);
      if (!oauthSession.accessToken) throw new Error('invalid_tokens');
      console.log('[github/callback] ✅ Token obtained');

      // 1. Get user profile
      const ghRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${oauthSession.accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      });
      const profile = await ghRes.json();
      console.log('[github/callback] 📦 Profile:', profile);

      // 2. Try to get email from the profile
      let email = profile.email;

      // 3. If missing, try /user/emails
      if (!email) {
        console.log(
          '[github/callback] 🔍 Email missing in profile, fetching from /user/emails...',
        );
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${oauthSession.accessToken}`,
            Accept: 'application/vnd.github+json',
          },
        });

        if (!emailsRes.ok) {
          console.error(
            '[github/callback] ❌ /user/emails returned status:',
            emailsRes.status,
          );
          if (emailsRes.status === 403) {
            throw new Error(
              'Email is private or scope missing – please set a public email in your GitHub profile.',
            );
          }
          throw new Error(`/user/emails API error: ${emailsRes.status}`);
        }

        const emails = await emailsRes.json();
        if (!Array.isArray(emails)) {
          throw new Error('Invalid response from /user/emails');
        }
        const primaryEmail =
          emails.find((e: any) => e.primary) ||
          emails.find((e: any) => e.verified);
        email = primaryEmail?.email;
      }

      if (!email) throw new Error('no_email_found');
      console.log('[github/callback] 📧 Final email:', email);

      // 4. Find or create Supabase user by email
      const {
        data: { users },
      } = await ctx.supabaseAdmin.auth.admin.listUsers();
      const existingUser = users?.find((u: User) => u.email === email);
      let userId = existingUser?.id;

      if (!userId) {
        console.log('[github/callback] 👤 Creating new user...');
        const { data: newUser, error } =
          await ctx.supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: { name: profile.login, github_login: profile.login },
          });
        if (error) {
          console.error('[github/callback] ❌ Create user error:', error);
          throw error;
        }
        userId = newUser.user.id;
      }

      // 5. Save GitHub session
      console.log('[github/callback] 💾 Saving GitHub session...');
      await this.pipelineService.saveGitHubSession(userId, oauthSession);
      console.log('[github/callback] ✅ Session saved');

      // 6. Redirect: dynamic if projectRedirect exists, otherwise fallback
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
