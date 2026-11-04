import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names, last-wins on conflicts.
 *
 * The helper every shadcn-convention component expects. twMerge is what makes
 * a variant overridable: `cn("px-4", props.className)` lets a caller pass
 * `px-6` and actually get it, instead of shipping both and letting CSS order
 * decide.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
