// A box in the techno frame (styles/techno-box.css): fixed corners and side caps, with the rails and the dark
// panel repeating to any size, so it grows with its content. Purely presentational: any props pass through to the
// element, and `as` picks the element when the box is a landmark (a labelled <section>, an <aside>).

import type { HTMLAttributes } from "react";

export function TechnoBox({
  as: Tag = "div",
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "aside" }) {
  return <Tag className={className ? `techno-box ${className}` : "techno-box"} {...rest} />;
}
