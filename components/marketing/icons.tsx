export type ServiceIconName = "tax" | "dsf" | "accounting" | "calendar" | "expert" | "person" | "people" | "building" | "whatsapp" | "phone" | "pin";

export function ServiceIcon({ name }: { name: ServiceIconName }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "h-7 w-7",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "tax":
      return (
        <svg {...common}>
          <path d="M8 7h8M8 3.5h5.5V7" />
          <rect x="5" y="7" width="14" height="13.5" rx="1.6" />
          <path d="M9 12h6M9 15.5h4" />
        </svg>
      );
    case "dsf":
      return (
        <svg {...common}>
          <rect x="6" y="3.5" width="12" height="17" rx="1.6" />
          <path d="M9 8h6M9 11.5h6M9 15h3" />
          <circle cx="16.5" cy="16.5" r="2.2" />
          <path d="M16.5 15.4v1.3l.8.5" />
        </svg>
      );
    case "accounting":
      return (
        <svg {...common}>
          <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" />
          <path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="12" height="14" rx="1.5" />
          <path d="M4 9h12M8 3.5v3M12 3.5v3" />
          <circle cx="17" cy="16" r="3" />
          <path d="M17 14.6v1.6l1 .6" />
        </svg>
      );
    case "expert":
      return (
        <svg {...common}>
          <rect x="6" y="3.5" width="12" height="15" rx="1.5" />
          <path d="M9 3.5h6v2.2H9zM9 10h6M9 13h4" />
          <circle cx="17" cy="17.5" r="2.4" />
          <path d="M17 16.4v1.2l.7.5" />
        </svg>
      );
    case "person":
      return (
        <svg {...common} className="h-8 w-8">
          <circle cx="12" cy="8" r="3" />
          <path d="M6 19c.8-3.2 3-4.8 6-4.8s5.2 1.6 6 4.8" />
        </svg>
      );
    case "people":
      return (
        <svg {...common} className="h-8 w-8">
          <circle cx="9" cy="9" r="2.4" />
          <circle cx="15.5" cy="9.2" r="2" />
          <path d="M4.8 18.5c.6-2.6 2.4-3.9 4.4-3.9s3.6 1.2 4.2 3.6" />
          <path d="M14 14.8c1.6-.2 3.2.6 4 2.7" />
        </svg>
      );
    case "building":
      return (
        <svg {...common} className="h-8 w-8">
          <path d="M5 20V6.5A1.5 1.5 0 0 1 6.5 5H14l5 3.2V20" />
          <path d="M9 20v-4h3v4M9 9h2M9 12.5h2M14.5 11h2M14.5 14.5h2" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...common} className="h-5 w-5">
          <path d="M6 18.5 7.2 15A6.5 6.5 0 1 1 9.2 17.2L6 18.5z" />
          <path d="M9.2 10.2c.2-.4.3-.4.6-.4h.4c.2 0 .4 0 .5.4.1.3.4 1 .4 1.1s.1.3 0 .4-.2.3-.4.5-.2.3-.1.5.6 1.1 1.3 1.5c.6.4 1.1.5 1.3.4s.6-.3.7-.6.2-.4.3-.4h.5c.2 0 .4.1.5.3l.6 1.4c.1.2 0 .5-.2.7-.3.3-1.2.7-2.4.4-1.5-.4-3-1.6-3.8-3.4-.4-.8-.3-1.4 0-1.8z" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common} className="h-5 w-5">
          <rect x="8" y="3.5" width="8" height="17" rx="1.6" />
          <path d="M11 17.5h2" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common} className="h-5 w-5">
          <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
          <circle cx="12" cy="11" r="1.8" />
        </svg>
      );
    default:
      return null;
  }
}
