"use client";

import clsx from "clsx";

const sizeClass = {
  sm: "h-8 w-8 min-h-8 min-w-8 text-[11px]",
  md: "h-10 w-10 min-h-10 min-w-10 text-sm",
  lg: "h-14 w-14 min-h-14 min-w-14 text-lg",
};

export default function UserAvatar({
  image,
  name,
  size = "md",
  className,
}: {
  image?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initial = (name?.trim()?.[0] || "?").toUpperCase();
  const base = sizeClass[size];

  if (image) {
    return (
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        className={clsx("shrink-0 rounded-full object-cover ring-2 ring-white/90 dark:ring-black/50", base, className)}
      />
    );
  }

  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-200 to-gray-300 font-semibold text-gray-700 dark:from-gray-600 dark:to-gray-700 dark:text-gray-100",
        base,
        className
      )}
      aria-hidden
    >
      {initial}
    </div>
  );
}
