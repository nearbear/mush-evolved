// The kit's section and figure frames (docs/plans/design-kit.md, "Conventions for new sections").

import type { ReactNode } from "react";

export const noop = () => {};

/** One component's section: an id the header nav links to, a heading, a paragraph about the file, then figures. */
export function Section({ id, heading, about, row, children }: { id: string; heading: string; about: ReactNode; row?: string; children: ReactNode }) {
  return (
    <section id={id}>
      <h2>{heading}</h2>
      <p>{about}</p>
      <div className={row ? `m2k-row ${row}` : "m2k-row"}>{children}</div>
    </section>
  );
}

export function Figure({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <figure>
      {children}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
