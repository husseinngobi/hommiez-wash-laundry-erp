import { createClient } from '@supabase/supabase-js';
import path from 'path';

const getSupabaseStorageClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for profile picture upload');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

const sanitizeFileName = (name: string) =>
  name
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase();

export const uploadProfileImageToSupabase = async (file: Express.Multer.File, userId: number) => {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'profile-pictures';
  const ext = path.extname(file.originalname) || '.jpg';
  const safeBase = sanitizeFileName(path.basename(file.originalname, ext)) || 'profile';
  const objectPath = `users/${userId}/${Date.now()}-${safeBase}${ext.toLowerCase()}`;

  const supabase = getSupabaseStorageClient();

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype || 'image/jpeg',
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(`Supabase upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);

  if (!data?.publicUrl) {
    throw new Error('Failed to resolve public URL for uploaded profile picture');
  }

  return {
    objectPath,
    publicUrl: data.publicUrl,
    bucket,
  };
};
