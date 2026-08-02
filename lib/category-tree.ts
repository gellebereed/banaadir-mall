/**
 * Category hierarchy helpers — safe to import from client and server.
 *
 * Categories mirror Odoo's `product.category`: a tree, linked by
 * `parentSlug` (Odoo's `parent_id`). These functions are pure — they take
 * the full category list and answer questions about it — so the async
 * wrappers in lib/api.ts and the admin UI in CategoryManagerClient share
 * one implementation instead of each walking the parents themselves.
 *
 * Every walk here is cycle-safe. The database rejects a cycle (see the
 * trigger in supabase/migration-odoo-catalog.sql) and so does the save
 * action, but a stale JSON fallback could still hold one, and a category
 * that is its own ancestor would otherwise loop forever.
 */

import type { Category, CategoryNode } from "./types";

/**
 * Assemble the flat list into a tree, resolving Odoo's `complete_name`
 * ("Home & Living / Cookware") and depth along the way.
 *
 * A category whose parent is missing — deleted, or filtered out of this
 * list because it's hidden — is promoted to a root rather than dropped.
 * Losing a whole branch because one parent went away is far worse than
 * showing it one level too high.
 */
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>(
    categories.map((c) => [c.slug, { ...c, depth: 0, completeName: c.name, children: [] }]),
  );

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentSlug ? nodes.get(node.parentSlug) : undefined;
    if (parent && parent.slug !== node.slug) parent.children.push(node);
    else roots.push(node);
  }

  // Depth and complete_name can only be computed once the links exist.
  const seen = new Set<string>();
  const walk = (node: CategoryNode, depth: number, prefix: string) => {
    if (seen.has(node.slug)) {
      node.children = [];
      return;
    }
    seen.add(node.slug);
    node.depth = depth;
    node.completeName = prefix ? `${prefix} / ${node.name}` : node.name;
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of node.children) walk(child, depth + 1, node.completeName);
  };
  for (const root of roots) walk(root, 0, "");

  return roots;
}

/** Tree back to a list, parents immediately followed by their children. */
export function flattenCategoryTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flattenCategoryTree(n.children)]);
}

/**
 * A category and all its ancestors, root first — the breadcrumb trail, and
 * Odoo's `complete_name` broken into its parts. Empty when the slug is
 * unknown.
 */
export function categoryPath(categories: Category[], slug: string): Category[] {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const path: Category[] = [];
  const seen = new Set<string>();

  let cursor = bySlug.get(slug);
  while (cursor && !seen.has(cursor.slug)) {
    seen.add(cursor.slug);
    path.unshift(cursor);
    cursor = cursor.parentSlug ? bySlug.get(cursor.parentSlug) : undefined;
  }
  return path;
}

/** Odoo's `complete_name`, e.g. "Home & Living / Cookware". */
export function categoryCompleteName(categories: Category[], slug: string): string {
  return categoryPath(categories, slug).map((c) => c.name).join(" / ");
}

/**
 * A category's slug plus every slug beneath it. Browsing a parent has to
 * include its children's products — a tree whose parent page is empty is
 * worse than no tree at all.
 */
export function categoryWithDescendants(categories: Category[], slug: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const c of categories) {
    if (!c.parentSlug) continue;
    childrenOf.set(c.parentSlug, [...(childrenOf.get(c.parentSlug) ?? []), c.slug]);
  }

  const collected: string[] = [];
  const queue = [slug];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    collected.push(current);
    queue.push(...(childrenOf.get(current) ?? []));
  }
  return collected;
}

/**
 * Storefront visibility. Hiding a category hides everything beneath it —
 * without this, hiding "Home & Living" would leave its "Cookware" child in
 * the navbar, now promoted to a top-level entry because its parent is gone
 * from the list.
 */
export function visibleCategories(categories: Category[]): Category[] {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));

  return categories.filter((category) => {
    const seen = new Set<string>();
    let cursor: Category | undefined = category;
    while (cursor && !seen.has(cursor.slug)) {
      if (cursor.hidden) return false;
      seen.add(cursor.slug);
      cursor = cursor.parentSlug ? bySlug.get(cursor.parentSlug) : undefined;
    }
    return true;
  });
}

/**
 * Categories that may be chosen as `slug`'s parent — everything except the
 * category itself and its own descendants. Choosing a descendant would make
 * the category its own ancestor; not offering the choice is friendlier than
 * explaining the error afterwards.
 */
export function eligibleParents(categories: Category[], slug: string): Category[] {
  const forbidden = new Set(categoryWithDescendants(categories, slug));
  return categories.filter((c) => !forbidden.has(c.slug));
}
