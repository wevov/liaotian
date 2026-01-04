// lib/auth.ts
import { supabase } from './supabase';

export async function signUpUser(email: string, password: string, username: string, display_name: string) {
  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) throw new Error('User ID not found');

  // 2. Create profile in 'profiles' table
  const { error: profileError } = await supabase
    .from('profiles')
    .insert([
      {
        id: userId,
        username,
        display_name,
        bio: '',
        avatar_url: '',
        banner_url: '',
        verified: false,
        theme: 'light',
        verification_request: '',
      },
    ]);

  if (profileError) throw profileError;

  return authData.user;
}
