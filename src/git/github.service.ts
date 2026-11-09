import { Injectable } from '@nestjs/common';
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
    const oauthSession = await githubOAuthClient.code.getToken(url);
    if (!oauthSession.accessToken) throw new Error('invalid_tokens');
    console.log('[github/callback] ✅ Token obtained');

    const ghRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${oauthSession.accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });
    const profile = await ghRes.json();
    console.log('[github/callback] 📦 Profile:', profile);


    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${oauthSession.accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    const emails:{email:string, verified:boolean, primary:boolean}[] = (await emailsRes.json())

    console.info({emails})
    
    const existingUser: Users | null = (
      await Promise.all(
        emails.map((e) => this.userRepo.findOneBy({ email: e.email })),
      )
    ).filter((i) => i)?.[0];

    let userId = existingUser?.id;

    if (!userId) {
      const primaryEmail =
        emails.find((e) => e.primary) ||
        emails.find((e) => e.verified);

      const { data: newUser, error } =
        await ctx.supabaseAdmin.auth.admin.createUser({
          email: primaryEmail?.email,
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
  }
}
