import { createClient, User } from '@supabase/supabase-js';
import { supabaseEnv } from '../config';

export const getUserByEmail = async (
  email: string,
  profile: { name: string; username: string },
) => {
  const supabaseAdmin = createClient(
    supabaseEnv.url as string,
    supabaseEnv.secretKeys.default,
  );
  const {
    data: { users },
  } = await supabaseAdmin.auth.admin.listUsers();
  let userId = users.find((u: User) => u.email === email)?.id;

  if (!userId) {
    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      user_metadata: {
        name: profile.name,
        gitlab_login: profile.username,
      },
    });
    if (error) throw error;
    userId = newUser.user.id;
  }
};
