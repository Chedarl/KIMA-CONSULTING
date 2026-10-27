/**
 * KiMA wordmark. The tittle on the i is a brand mark, not a status colour.
 */
export function KimaWordmark({
  tone = "light",
  size = "sm",
  layout = "row",
}: {
  tone?: "light" | "dark";
  size?: "sm" | "lg";
  /** Small lockup. The login panel always stacks. */
  layout?: "row" | "stack";
}) {
  const color = tone === "light" ? "#ffffff" : "#0D1B2A";
  const sub = tone === "light" ? "rgba(255,255,255,0.78)" : "#5C6B7A";
  const large = size === "lg";

  const name = (
    <span
      className={`font-display font-bold leading-none tracking-tight ${large ? "text-6xl sm:text-7xl" : "text-[1.65rem]"}`}
      style={{ color }}
    >
      K
      <span className="relative inline-block">
        ı
        <span
          className={`absolute left-1/2 -translate-x-1/2 rounded-[2px] bg-[#E0A100] ${
            large ? "top-[0.16em] h-[0.14em] w-[0.14em]" : "top-[0.14em] h-[0.15em] w-[0.15em]"
          }`}
          aria-hidden="true"
        />
      </span>
      MA
    </span>
  );

  if (!large && layout === "row") {
    return (
      <span className="inline-flex items-baseline gap-2">
        {name}
        <span className="hidden text-[0.62rem] font-semibold uppercase tracking-[0.22em] min-[420px]:inline" style={{ color: sub }}>
          Compliance
        </span>
      </span>
    );
  }

  if (!large) {
    return (
      <span className="inline-flex flex-col items-start leading-none">
        {name}
        <span className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.28em]" style={{ color: sub }}>
          Compliance
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-center gap-3">
      {name}
      <span className="text-sm font-semibold uppercase tracking-[0.42em]" style={{ color: sub }}>
        Compliance
      </span>
    </span>
  );
}
