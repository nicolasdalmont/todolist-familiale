import { initials } from "@/lib/format";
import type { Profile } from "@/lib/types";

const SIZES = {
  sm: "h-6 w-6 text-[11px]",
  md: "h-8 w-8 text-[13px]",
  lg: "h-14 w-14 text-xl",
};

export function Avatar({
  profile,
  size = "md",
  className = "",
}: {
  profile: Pick<Profile, "name" | "color">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white ${SIZES[size]} ${className}`}
      style={{ backgroundColor: profile.color }}
      title={profile.name}
    >
      {initials(profile.name)}
    </span>
  );
}
