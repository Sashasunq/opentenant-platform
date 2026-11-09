import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Session,
  UseGuards,
} from '@nestjs/common';
import { AppService } from './supabase.service';
import ClientOAuth2 from 'client-oauth2';
import { config, supabaseEnv } from '../config';
import {
  SupabaseSession,
  SupabaseTenantDTO,
  ConnectRedirectResponseDTO,
  applyMigrationDTO,
} from '../types';

import { withSupabase, SupabaseCtx } from '@supabase/server/adapters/nestjs';
import type { SupabaseContext } from '@supabase/server';
import {
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

const oauth2Client = new ClientOAuth2(config);

@Controller()
@UseGuards(
  withSupabase({
    auth: 'user',
    env: supabaseEnv,
  }),
)
@ApiBearerAuth('user')
export class SupabaseController {
  constructor(private readonly appService: AppService) {}

  @Get('platform/me')
  @ApiResponse({ type: SupabaseCtx['userClaims'] })
  async me(@SupabaseCtx('userClaims') user: SupabaseContext['userClaims']) {
    let session: SupabaseSession | undefined;
    try {
      session = await this.appService.getSessionForUser(user!.id);
    } catch (err) {
      console.error('session error', err);
    }

    if (!session?.accessToken) {
      return { error: 'platform_api_not_enabled' };
    }

    return user;
  }

  @Get('platform/projects/:orgId')
  @ApiResponse({
    status: 200,
    description: 'Successfully fetched projects for organization.',
    schema: {
      // 2. Reference the exact schema key name from your external YAML/JSON file
      $ref: getSchemaPath('OrganizationProjectsResponse'),
    },
  })
  @ApiParam({ name: 'orgId' })
  async projects(
    @Param('orgId') orgId,
    @SupabaseCtx('userClaims') user: SupabaseContext['userClaims'],
  ) {
    const supaManagementClient = await this.appService.createSupaClient(
      user!.id,
    );
    return (await supaManagementClient.getAllProjectsForOrganization(orgId))
      .data;
  }

  @Get('platform/tenant/:id')
  @ApiResponse({ type: SupabaseTenantDTO })
  @ApiParam({ name: 'id' })
  async getTenant(
    @Param('id') id,
    @SupabaseCtx('userClaims') user: SupabaseContext['userClaims'],
  ) {
    const tenant = await this.appService.getTenant(user!.id, id);
    if (tenant?.id) {
      const tenantDto = {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        ffmpeglabStatus: tenant.ffmpeglabStatus,
        ref: tenant.ref,
        region: tenant.region,
        created: tenant.created,
        created_at: tenant.created_at,
        user: tenant.user,
        updated: tenant.updated,
      } as SupabaseTenantDTO;
      return tenantDto;
    }
  }

  @Put('platform/tenant/:id/:status')
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'status' })
  async toggleTenant(
    @Param() params: { id: string; status: 'on' | 'off' },
    @SupabaseCtx('userClaims') user: SupabaseContext['userClaims'],
  ) {
    const tenant = await this.appService.getTenant(user!.id, params.id);
    if (tenant) {
      tenant.ffmpeglabStatus = params.status;
      return await this.appService.updateTenant(tenant);
    }
    throw NotFoundException;
  }

  @Post('platform/migration')
  async applyMigration(
    @Body() body: applyMigrationDTO,
    @SupabaseCtx('userClaims') user: SupabaseContext['userClaims'],
  ) {
    return await this.appService.applyMigration(user!.id, body);
  }

  @Get('platform/organizations')
  @ApiResponse({
    status: 200,
    description: 'Successfully fetched organizations.',
    schema: {
      type: 'array',
      items: {
        $ref: getSchemaPath('OrganizationResponseV1'),
      },
    },
  })
  async organizations(
    @SupabaseCtx('userClaims') user: SupabaseContext['userClaims'],
  ) {
    const supaManagementClient = await this.appService.createSupaClient(
      user!.id,
    );
    return (await supaManagementClient.listAllOrganizations()).data;
  }

  @Get('platform/connect')
  @ApiResponse({ type: ConnectRedirectResponseDTO })
  platformLogin(
    @Session() session: Record<string, any>,
    @SupabaseCtx('userClaims') user: SupabaseContext['userClaims'],
  ): { redirectUri: string } {
    session.user = user?.id;
    const redirectUri = oauth2Client.code.getUri();
    return { redirectUri };
  }

  @Get('platform/connect/project/:projectId')
  @ApiParam({ name: 'projectId' })
  async connectProject(
    @Param('projectId') projectId,
    @SupabaseCtx('userClaims') user: SupabaseContext['userClaims'],
  ) {
    const existingTenant = await this.appService.getTenant(user!.id, projectId);

    if (existingTenant && existingTenant.ffmpeglabStatus === 'on') {
      return { status: 'on' };
    }

    await this.appService.createTenant(user!.id, projectId);

    return { status: 'on' };
  }
}
