type ProfileUser = {
  profile_picture?: string | null;
  profile_picture_url?: string | null;
};

export const resolveProfilePictureUrl = (user: ProfileUser | null | undefined, apiOrigin: string): string | undefined => {
  if (!user) return undefined;

  const url = user.profile_picture_url || user.profile_picture;
  if (!url) return undefined;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  if (url.startsWith('/')) {
    return `${apiOrigin}${url}`;
  }

  return `${apiOrigin}/${url}`;
};
