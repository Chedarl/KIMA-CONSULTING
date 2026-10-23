/**
 * Official KIMA CONSULTING lockup.
 * Light tone is the white plate for navy headers. Dark tone is the colour
 * plate for white surfaces. The black ground of the source artwork is gone.
 */
export function KimaWordmark({
  tone = "light",
  size = "sm",
  className = "",
}: {
  tone?: "light" | "dark";
  size?: "sm" | "lg";
  className?: string;
  /** Call sites still pass this. The official lockup is always horizontal. */
  layout?: "row" | "stack";
}) {
  const src = tone === "light" ? "/brand/logo-white.svg" : "/brand/logo-color.svg";
  const sizeClass =
    size === "lg" ? "mx-auto h-auto w-[min(100%,22rem)]" : "h-auto max-h-12 w-auto";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="KIMA CONSULTING"
      width={751}
      height={228}
      className={`${sizeClass} ${className}`}
    />
  );
}
