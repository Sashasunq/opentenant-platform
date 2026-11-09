import { Injectable } from '@nestjs/common';

import { config } from '../config';
import { InjectRepository } from '@nestjs/typeorm';
import { Users } from '../model/user.entity';
import { Repository } from 'typeorm';
import { PipelineService } from '../pipelines/pipeline.service';

import { githubOAuthClient } from './github-auth';
import { SupabaseContext } from '@supabase/server';

@Injectable()
export class GithubService {
  constructor(
    @InjectRepository(Users)
    private userRepo: Repository<Users>,
    private readonly pipelineService: PipelineService,
  ) {}
  async loginCallback(url: string, ctx: SupabaseContext) {
    console.log('[github/callback] ⏳ Exchanging code...');
    const oauthSession = await githubOAuthClient.code.getToken(url);
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
    const existingUser = await this.userRepo.findOneBy({ email });
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
  }
}
