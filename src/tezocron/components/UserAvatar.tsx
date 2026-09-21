import React, { useEffect, useState } from 'react';
import { subscribeToPublicUser, getCachedUser } from '../lib/userDirectory';

interface UserAvatarProps {
  userId: string;
  fallbackName?: string;
  fallbackPhotoURL?: string;
  className?: string;
  textClassName?: string;
}

const isUsablePhoto = (url?: string) =>
  Boolean(url && (url.startsWith('http') || url.startsWith('data:image')));

/**
 * Live profile avatar. Always shows the user's current profile picture,
 * updating instantly for everyone when that user changes it.
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  userId,
  fallbackName = 'Member',
  fallbackPhotoURL,
  className = 'w-full h-full object-cover',
  textClassName,
}) => {
  const cached = getCachedUser(userId);
  const [photoURL, setPhotoURL] = useState<string | undefined>(cached?.photoURL || fallbackPhotoURL);
  const [name, setName] = useState<string>(cached?.displayName || fallbackName);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userId) return;
    return subscribeToPublicUser(userId, (summary) => {
      if (summary.photoURL !== undefined) {
        setPhotoURL(summary.photoURL);
        setFailed(false);
      }
      if (summary.displayName) setName(summary.displayName);
    });
  }, [userId]);

  const url = isUsablePhoto(photoURL) ? photoURL : isUsablePhoto(fallbackPhotoURL) ? fallbackPhotoURL : undefined;

  if (!url || failed) {
    return (
      <span className={textClassName}>
        {(name || fallbackName || 'U').charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={name || fallbackName}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
};

export default UserAvatar;
