/**
 * Gives `<style>` tags created in the browser the page's CSP nonce (T-218),
 * so `style-src-elem` lets them through without `'unsafe-inline'`:
 *
 * - unhead's tags (Nuxt UI's theme colours on client-only pages, whose SPA
 *   shell has no styles), through its `tags:afterResolve` hook;
 * - styles that modules append to `<head>` directly: Nuxt UI's temporary
 *   colours style while an SPA page hydrates, and @nuxt/icon's per-icon CSS.
 *
 * The nonce comes from a script the server rendered with it (browsers hide
 * the attribute value but keep the `nonce` property). Only code that already
 * runs under the CSP can reach it, so this adds no new way in. Pages served
 * with a hashed CSP (`/r/**`) have no nonce, and the plugin does nothing.
 */
const NONCE_TAGS = new Set(["style", "script", "link"]);

export default defineNuxtPlugin({
  name: "salus:csp-nonce",
  enforce: "pre",
  setup() {
    const nonce = document.querySelector<HTMLElement>("script[nonce]")?.nonce;
    if (!nonce) return;

    const head = document.head;
    const stamp = (node: Node) => {
      if (node instanceof HTMLStyleElement && !node.nonce) node.nonce = nonce;
    };
    const appendChild = head.appendChild.bind(head);
    const insertBefore = head.insertBefore.bind(head);
    head.appendChild = <T extends Node>(node: T): T => {
      stamp(node);
      return appendChild(node);
    };
    head.insertBefore = <T extends Node>(node: T, child: Node | null): T => {
      stamp(node);
      return insertBefore(node, child);
    };

    injectHead().hooks?.hook("tags:afterResolve", ({ tags }) => {
      for (const tag of tags) {
        if (NONCE_TAGS.has(tag.tag)) tag.props.nonce = nonce;
      }
    });
  },
});
