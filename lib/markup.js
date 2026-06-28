// SPDX-License-Identifier: GPL-2.0-or-later
//
// Pure HTML-to-blocks converter for OpenProject comment html. No GNOME imports,
// so it runs under plain gjs for tests. Walks tags by name (ignoring op-uc-*
// classes) and produces a small block model the St side turns into widgets.

const VOID = new Set(["br", "hr", "img", "input", "meta", "link"]);
const BLOCK = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "pre",
]);
const INLINE_WRAP = {
  strong: "b", b: "b", em: "i", i: "i", code: "tt", del: "s", s: "s", strike: "s",
};
const NAMED = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

export function escapeMarkup(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function decodeEntities(text) {
  return String(text || "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : m;
  });
}

// Split html into a flat token stream of text / open / close / void nodes.
export function tokenize(html) {
  const tokens = [];
  const re = /<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) tokens.push({ type: "text", text: html.slice(last, m.index) });
    const name = m[2].toLowerCase();
    const kind = m[1] === "/" ? "close" : (m[4] === "/" || VOID.has(name) ? "void" : "open");
    tokens.push({ type: kind, name, attrs: m[3] || "" });
    last = re.lastIndex;
  }
  if (last < html.length) tokens.push({ type: "text", text: html.slice(last) });
  return tokens;
}

export function attrValue(attrs, key) {
  const m = new RegExp(`${key}\\s*=\\s*"([^"]*)"`).exec(attrs || "");
  return m ? m[1] : "";
}

function shift(link, by) {
  return { start: link.start + by, end: link.end + by, href: link.href };
}

// Advance past the matching close tag if `idx` sits on it.
function skipClose(tokens, idx, name) {
  if (idx < tokens.length && tokens[idx].type === "close" && tokens[idx].name === name) {
    return idx + 1;
  }
  return idx;
}

// Build Pango markup + link ranges from inline tokens until a block boundary or
// the matching close of `stopName`. Returns { markup, text, links, next }.
// `text` is the visible (un-escaped) string used to index link ranges.
function renderInline(tokens, start, stopName) {
  let markup = "";
  let text = "";
  const links = [];
  let i = start;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "close" && (t.name === stopName || BLOCK.has(t.name))) break;
    if (t.type === "open" && BLOCK.has(t.name)) break;
    if (t.type === "text") {
      const s = decodeEntities(t.text);
      markup += escapeMarkup(s);
      text += s;
      i++;
    } else if (t.type === "void" && t.name === "br") {
      markup += "\n";
      text += "\n";
      i++;
    } else if (t.type === "open" && INLINE_WRAP[t.name]) {
      const tag = INLINE_WRAP[t.name];
      const inner = renderInline(tokens, i + 1, t.name);
      markup += `<${tag}>${inner.markup}</${tag}>`;
      const base = text.length;
      text += inner.text;
      for (const lk of inner.links) links.push(shift(lk, base));
      i = skipClose(tokens, inner.next, t.name);
    } else if (t.type === "open" && t.name === "a") {
      const cls = attrValue(t.attrs, "class");
      const href = attrValue(t.attrs, "href");
      const inner = renderInline(tokens, i + 1, "a");
      const next = skipClose(tokens, inner.next, "a");
      if (cls.includes("op-uc-link_permalink")) {
        // decorative heading anchor: drop entirely
        i = next;
        continue;
      }
      const isMention = cls.includes("user-mention");
      const label = isMention ? `@${inner.text}` : inner.text;
      const linkStart = text.length;
      markup += `<span underline="single">${escapeMarkup(label)}</span>`;
      text += label;
      if (href) links.push({ start: linkStart, end: text.length, href });
      i = next;
    } else {
      // unknown open/void/close: skip the tag, keep walking
      i++;
    }
  }
  return { markup, text, links, next: i };
}

// Collect raw text of a <pre> verbatim (decode entities, strip any inner tags).
function rawText(tokens, start, stopName) {
  let text = "";
  let i = start;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "close" && t.name === stopName) break;
    if (t.type === "text") text += decodeEntities(t.text);
    else if (t.type === "void" && t.name === "br") text += "\n";
    i++;
  }
  return { text, next: i };
}

function parseListItems(tokens, start) {
  const items = [];
  let i = start;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "close" && (t.name === "ul" || t.name === "ol")) { i++; break; }
    if (t.type === "open" && t.name === "li") {
      const inner = renderInline(tokens, i + 1, "li");
      items.push({ markup: inner.markup.trim(), links: inner.links });
      i = skipClose(tokens, inner.next, "li");
    } else {
      i++;
    }
  }
  return { items, next: i };
}

function parseBlocks(tokens, start, stopName) {
  const blocks = [];
  let i = start;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "close" && t.name === stopName) { i++; break; }
    if (t.type === "open" && t.name === "p") {
      const inner = renderInline(tokens, i + 1, "p");
      const markup = inner.markup.trim();
      if (markup) blocks.push({ type: "para", markup, links: inner.links });
      i = skipClose(tokens, inner.next, "p");
    } else if (t.type === "open" && /^h[1-6]$/.test(t.name)) {
      const level = Number(t.name[1]);
      const inner = renderInline(tokens, i + 1, t.name);
      const markup = inner.markup.trim();
      if (markup) blocks.push({ type: "heading", level, markup, links: inner.links });
      i = skipClose(tokens, inner.next, t.name);
    } else if (t.type === "open" && t.name === "blockquote") {
      const inner = parseBlocks(tokens, i + 1, "blockquote");
      blocks.push({ type: "quote", blocks: inner.blocks });
      i = inner.next;
    } else if (t.type === "open" && (t.name === "ul" || t.name === "ol")) {
      const ordered = t.name === "ol";
      const list = parseListItems(tokens, i + 1);
      blocks.push({ type: "list", ordered, items: list.items });
      i = list.next;
    } else if (t.type === "open" && t.name === "pre") {
      const raw = rawText(tokens, i + 1, "pre");
      blocks.push({ type: "code", text: raw.text });
      i = skipClose(tokens, raw.next, "pre");
    } else if (t.type === "text" && decodeEntities(t.text).trim()) {
      // loose text outside any block: wrap as a paragraph
      const inner = renderInline(tokens, i, stopName);
      const markup = inner.markup.trim();
      if (markup) blocks.push({ type: "para", markup, links: inner.links });
      i = inner.next;
    } else {
      i++;
    }
  }
  return { blocks, next: i };
}

export function htmlToBlocks(html) {
  const tokens = tokenize(String(html || ""));
  if (tokens.length === 0) return [];
  return parseBlocks(tokens, 0, null).blocks;
}

// Flatten the block model into a single-line Pango markup string for the menu
// row: inline emphasis/code/links are preserved, block structure collapses to
// separators, and all whitespace folds to single spaces. Links are not made
// clickable here (the row itself opens the dialog), only kept visually styled.
function blockToInline(b) {
  if (b.type === "para" || b.type === "heading") return b.markup;
  if (b.type === "code") return `<tt>${escapeMarkup(b.text)}</tt>`;
  if (b.type === "quote") return b.blocks.map(blockToInline).join(" ");
  if (b.type === "list") {
    return b.items.map((it) => `• ${it.markup}`).join("  ");
  }
  return "";
}

export function htmlToInlineMarkup(html) {
  const blocks = htmlToBlocks(html);
  return blocks
    .map(blockToInline)
    .filter(Boolean)
    .join("  ")
    .replace(/\s+/g, " ")
    .trim();
}
