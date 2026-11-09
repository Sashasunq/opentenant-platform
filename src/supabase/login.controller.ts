import {
  Controller,
  Get,
  Request,
  Response,
  Session,
  UseGuards,
} from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import ClientOAuth2 from 'client-oauth2';
import { config, supabaseEnv } from '../config';

import { withSupabase, SupabaseCtx } from '@supabase/server/adapters/nestjs';
import { getSupabaseProfile } from './supabase';
import { ApiResponse } from '@nestjs/swagger';
import { ConnectRedirectResponseDTO } from '../types';
import type { SupabaseContext } from '@supabase/server';
import { User } from '@supabase/supabase-js';

const oauth2Client = new ClientOAuth2(config);

@Controller()
@UseGuards(
  withSupabase({
    auth: 'none',
    env: supabaseEnv,
  }),
)
export class LoginController {
  constructor(private readonly appService: SupabaseService) {}

  @Get('platform/login')
  @ApiResponse({ type: ConnectRedirectResponseDTO })
  platformLogin(): { redirectUri: string } {
    const redirectUri = oauth2Client.code.getUri();
    return { redirectUri };
  }

  @Get('platform/login/redirect')
  @ApiResponse({ type: ConnectRedirectResponseDTO })
  platformLoginRedirect(@Response() response): void {
    const redirectUri = oauth2Client.code.getUri();
    response.redirect(redirectUri);
  }

  @Get('platform/oauth2/callback')
  async platformLoginCallback(
    @Request() req,
    @Response() response,
    @Session() session: Record<string, any>,
    @SupabaseCtx() ctx: SupabaseContext,
  ): Promise<void | { error: string }> {
    try {
      const oauthSession = await oauth2Client.code.getToken(
        (req as Request).url,
      );
      // console.info(oauthSession)

      if (!oauthSession.accessToken) throw 'invalid_tokens';

      const profile = await getSupabaseProfile(oauthSession);

      if (!profile?.email) throw 'invalid_tokens_for_profile';

      console.info('platform/oauth2/callback/session.user', {
        user: session.user,
        profile,
      });

      if (session.user) {
        await this.appService.saveOauthSession(session.user, oauthSession);
        return response.redirect(`${config.webAppRedirect}`);
      }

      const email = profile.email;

      if (!email) throw 'no_email';
      const {
        data: { users },
      } = await ctx.supabaseAdmin.auth.admin.listUsers();

      // Filter the returned array by email
      const existingUser = users.find((user) => (user as User).email === email);

      let userId = existingUser?.id;

      if (!userId) {
        const { data: newuser, error: createUserError } =
          await ctx.supabaseAdmin.auth.admin.createUser({
            email,
            user_metadata: { name: profile.user_name },
          });

        if (createUserError) throw createUserError;

        userId = newuser.user.id;
      }

      await this.appService.saveOauthSession(userId, oauthSession);

      const { data: linkData, error: createUserLinkError } =
        await ctx.supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: {
            redirectTo: config.webAppRedirect,
          },
        });

      if (createUserLinkError) throw createUserLinkError;

      const magiclink = linkData.properties.action_link;

      return response.redirect(magiclink);
    } catch (err) {
      console.error('oauth2/callback err', err);
      response.redirect(`${config.webAppRedirect}?status=error`);
    }
  }
}
