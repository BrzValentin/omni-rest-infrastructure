import { serializeJsonLd, type JsonLdNode } from "@/lib/json-ld";

/**
 * Embeds Schema.org JSON-LD (PR-18 Task 1).
 *
 * A native `<script>` is used rather than `next/script` because JSON-LD is data, not executable code.
 * Nodes that pruned away to `undefined` are dropped, and rendering nothing at all is preferred over
 * emitting an empty `<script>` element.
 *
 * Google reads JSON-LD from `<head>` or `<body>`; Next.js hoists this into `<head>` when it is
 * rendered from a page, which satisfies PR-18 Task 1's placement requirement.
 */
export function JsonLd({ nodes }: Readonly<{ nodes: readonly (JsonLdNode | undefined)[] }>) {
  const present = nodes.filter((node): node is JsonLdNode => node !== undefined);
  if (present.length === 0) return null;
  return (
    <script
      type="application/ld+json"
      // Escaped by `serializeJsonLd`, which neutralizes `<` so tenant-supplied text cannot close the
      // script element. Never pass a bare `JSON.stringify` result here.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(present.length === 1 ? present[0] : present) }}
    />
  );
}
