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
  /*
   * The small size carries an explicit HEIGHT, not two max-constraints.
   *
   * It used to be `h-auto max-h-12 w-auto`, which rendered the header lockup at
   * 0x0 on production: the image is a flex item inside the header's
   * `inline-flex items-center` link, and with both axes `auto` and only maxima
   * to work from it has no basis to size against, so it collapsed. The file
   * loaded correctly the whole time -- naturalWidth 300, complete true,
   * opacity 1 -- which is why nothing looked broken except the empty corner.
   *
   * A fixed height and `w-auto` give the aspect ratio something to resolve
   * against. `object-contain` is what makes the header's `max-sm:max-w-[6.5rem]`
   * safe: a max-width against a fixed height would otherwise squash the lockup
   * rather than letterbox it.
   *
   * The `lg` size was always correct -- it sets a real width -- so it is
   * untouched.
   */
  const sizeClass =
    size === "lg"
      ? "mx-auto h-auto w-[min(100%,22rem)]"
      : "h-8 w-auto object-contain sm:h-10";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="KIMA CONSULTING"
      /*
       * 306x100 is the lockup's real viewBox. These said 751x228, left over
       * from the superseded artwork, so the browser reserved a box of the
       * wrong aspect (3.29 against the true 3.06) and the header shifted once
       * the SVG arrived. Intrinsic size and declared size now agree.
       */
      width={306}
      height={100}
      className={`${sizeClass} ${className}`}
    />
  );
}
