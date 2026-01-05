import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
  console.log('[DEV] Supabase client exposed:', supabase);
  console.log('[DEV] Auth object:', supabase.auth);
  console.log('[DEV] Has getSession?', typeof supabase.auth.getSession);
}

export const uploadLogo = async (userId: string, file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/logo.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('profile-logos')
    .upload(fileName, file, {
      upsert: true,
      contentType: file.type
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage
    .from('profile-logos')
    .getPublicUrl(fileName);

  return data.publicUrl;
};
