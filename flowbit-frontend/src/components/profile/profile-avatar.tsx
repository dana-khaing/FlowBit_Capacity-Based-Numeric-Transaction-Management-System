import { useState } from "react";
import { type AuthUser } from "@/lib/auth-client";

type ProfileAvatarProps = {
  user: AuthUser;
  className?: string;
  textClassName?: string;
};

function getInitials(user: AuthUser) {
  return (user.full_name || user.username || "FB")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ProfileAvatar({
  user,
  className = "h-20 w-20 rounded-[28px]",
  textClassName = "text-2xl font-semibold",
}: ProfileAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (user.avatar_url && !imageFailed) {
    return (
      <img
        src={user.avatar_url}
        alt={user.full_name || user.username}
        className={`${className} object-cover`}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className={`flex items-center justify-center bg-[#d97a35] text-white ${className} ${textClassName}`}>
      {getInitials(user)}
    </div>
  );
}
