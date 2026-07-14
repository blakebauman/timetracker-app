import { useState } from "react";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  className?: string;
}

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/** Circular user avatar: renders the image when present (and loads), else initials. */
export function UserAvatar({ name, email, image, className }: UserAvatarProps) {
  const [broken, setBroken] = useState(false);
  const showImage = image && !broken;

  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-medium text-primary",
        className
      )}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={image}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initials(name, email)
      )}
    </span>
  );
}
