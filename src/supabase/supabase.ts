import ClientOAuth2 from 'client-oauth2';
import { SupabaseManagementAPI } from 'supabase-management-js';
import { organizationsUri, profileUri, SUPABASE_PLATFORM } from '../config';

export const getProject = async (
  supaManagementClient: SupabaseManagementAPI,
  projectId: string,
) => (await supaManagementClient.getProject(projectId)).data;

export const getSupabaseProfile = async (session: ClientOAuth2.Token) => {
  try {
    const profile = await (
      await fetch(profileUri, {
        headers: { Authorization: 'Bearer ' + session.accessToken },
      })
    ).json();
    console.info('getSupabaseProfile', profile);
    if (profile.email) {
      return profile;
    }
  } catch (err) {
    console.error('getSupabaseProfile err', err);
  }
  const [org] = await (
    await fetch(organizationsUri, {
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
