import ClientOAuth2 from 'client-oauth2';
import { SupabaseManagementAPI } from 'supabase-management-js';
import { profileUri, SUPABASE_PLATFORM } from '../config';

export const getProject = async (
  supaManagementClient: SupabaseManagementAPI,
  projectId: string,
) => (await supaManagementClient.getProject(projectId)).data;

export const getSupabaseProfile = async (session: ClientOAuth2.Token) => {
  const [org] = await (
    await fetch(profileUri, {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    })
  ).json();
  const [member] = await (
    await fetch(`${SUPABASE_PLATFORM}v1/organizations/${org.id}/members`, {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    })
  ).json();
  return member as { email: string; user_name: string };
};
