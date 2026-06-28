// SPDX-License-Identifier: GPL-2.0-or-later
//
// Unit tests for lib/markup.js. Run: gjs -m tests/markup.test.js

import { escapeMarkup, decodeEntities, htmlToBlocks, htmlToInlineMarkup, metaMarkup } from "../lib/markup.js";

let failures = 0;
let total = 0;
function check(name, cond, extra) {
  total++;
  const mark = cond ? "OK" : "FAIL";
  if (!cond) failures++;
  print(`[${mark}] ${name}${extra !== undefined ? "  -> " + extra : ""}`);
}

// escapeMarkup ---------------------------------------------------------------
check("escape: amp/lt/gt", escapeMarkup("a & b < c > d") === "a &amp; b &lt; c &gt; d",
  escapeMarkup("a & b < c > d"));
check("escape: empty/null", escapeMarkup("") === "" && escapeMarkup(null) === "");

// decodeEntities -------------------------------------------------------------
check("decode: named", decodeEntities("a &amp; b &lt; &gt; &quot;x&quot; &#39;y&#39;")
  === "a & b < > \"x\" 'y'", decodeEntities("a &amp; b &lt; &gt; &quot;x&quot; &#39;y&#39;"));
check("decode: numeric", decodeEntities("&#65;&#x42;") === "AB", decodeEntities("&#65;&#x42;"));
check("decode: nbsp", decodeEntities("a&nbsp;b") === "a b");
// Out-of-range / surrogate numeric entities must not throw (RangeError guard).
check("decode: above max code point unchanged",
  decodeEntities("&#x110000;") === "&#x110000;", decodeEntities("&#x110000;"));
check("decode: surrogate unchanged",
  decodeEntities("&#xD800;") === "&#xD800;", decodeEntities("&#xD800;"));
check("decode: valid astral plane", decodeEntities("&#x1F600;") === "\u{1F600}");

// metaMarkup -----------------------------------------------------------------
check("meta: author only (no time)",
  metaMarkup({ actor: "Alice" }, "70%") === "<span alpha=\"70%\">Alice</span>",
  metaMarkup({ actor: "Alice" }, "70%"));
check("meta: escapes author",
  metaMarkup({ actor: "a<b>" }, "70%") === "<span alpha=\"70%\">a&lt;b&gt;</span>",
  metaMarkup({ actor: "a<b>" }, "70%"));
check("meta: empty -> empty", metaMarkup({}, "70%") === "");
check("meta: alpha param honored",
  metaMarkup({ actor: "Bob" }, "60%").includes("alpha=\"60%\""),
  metaMarkup({ actor: "Bob" }, "60%"));
check("meta: absolute time is bold",
  metaMarkup({ actor: "Bob", createdAt: "2025-01-02T11:00:00Z" }, "70%").includes("<b>"),
  metaMarkup({ actor: "Bob", createdAt: "2025-01-02T11:00:00Z" }, "70%"));

// htmlToBlocks: plain paragraph ---------------------------------------------
{
  const b = htmlToBlocks("<p class=\"op-uc-p\">hello world</p>");
  check("blocks: single para type", b.length === 1 && b[0].type === "para", JSON.stringify(b));
  check("blocks: para markup", b[0].markup === "hello world", b[0].markup);
  check("blocks: para links empty", Array.isArray(b[0].links) && b[0].links.length === 0);
}
{
  const b = htmlToBlocks("<p class=\"op-uc-p\">a &amp; b</p>");
  check("blocks: entities decoded then escaped", b[0].markup === "a &amp; b", b[0].markup);
}
check("blocks: empty input -> []", htmlToBlocks("").length === 0);

// inline formatting ----------------------------------------------------------
{
  const b = htmlToBlocks("<p><strong>bold</strong> <em>it</em> <code>c</code> <del>d</del></p>");
  check("inline: emphasis -> pango",
    b[0].markup === "<b>bold</b> <i>it</i> <tt>c</tt> <s>d</s>", b[0].markup);
}
{
  const b = htmlToBlocks("<p>a<br>b</p>");
  check("inline: br -> newline", b[0].markup === "a\nb", JSON.stringify(b[0].markup));
}
{
  const b = htmlToBlocks("<p>code <code>x &lt; y</code></p>");
  check("inline: code inner escaped", b[0].markup === "code <tt>x &lt; y</tt>", b[0].markup);
}
// links ----------------------------------------------------------------------
{
  const b = htmlToBlocks("<p>see <a href=\"https://e.com/x\" class=\"op-uc-link\">site</a> now</p>");
  check("link: markup styled", b[0].markup.includes("site"), b[0].markup);
  check("link: one range", b[0].links.length === 1, JSON.stringify(b[0].links));
  // visible text is "see site now"; "site" at chars 4..8
  check("link: range offsets", b[0].links[0].start === 4 && b[0].links[0].end === 8,
    JSON.stringify(b[0].links[0]));
  check("link: href", b[0].links[0].href === "https://e.com/x", b[0].links[0].href);
}
// mention --------------------------------------------------------------------
{
  const b = htmlToBlocks("<p>cc <a class=\"user-mention op-uc-link\" href=\"/op/users/30\">Имя</a></p>");
  check("mention: @ prefixed visible", b[0].markup.includes("@Имя"), b[0].markup);
  check("mention: link range present", b[0].links.length === 1 && b[0].links[0].href === "/op/users/30",
    JSON.stringify(b[0].links));
}
// permalink anchor dropped ---------------------------------------------------
{
  const b = htmlToBlocks("<p>t<a class=\"op-uc-link_permalink\" aria-hidden=\"true\" href=\"#t\"></a></p>");
  check("permalink: dropped", b[0].markup === "t" && b[0].links.length === 0,
    JSON.stringify(b[0]));
}
// block structure ------------------------------------------------------------
{
  const b = htmlToBlocks("<p class=\"op-uc-p\">one</p><p class=\"op-uc-p\">two</p>");
  check("block: two paras", b.length === 2 && b[0].markup === "one" && b[1].markup === "two",
    JSON.stringify(b.map((x) => x.markup)));
}
{
  const b = htmlToBlocks("<h2 class=\"op-uc-h2\">Title</h2>");
  check("block: heading level", b[0].type === "heading" && b[0].level === 2 && b[0].markup === "Title",
    JSON.stringify(b[0]));
}
{
  const b = htmlToBlocks("<blockquote class=\"op-uc-blockquote\"><p>q a<br>q b</p></blockquote>");
  check("block: quote wraps para", b[0].type === "quote" && b[0].blocks.length === 1
    && b[0].blocks[0].type === "para" && b[0].blocks[0].markup === "q a\nq b",
    JSON.stringify(b[0]));
}
{
  const b = htmlToBlocks("<ul class=\"op-uc-list\"><li class=\"op-uc-list--item\">x</li>"
    + "<li class=\"op-uc-list--item\">y</li></ul>");
  check("block: ul items", b[0].type === "list" && b[0].ordered === false
    && b[0].items.length === 2 && b[0].items[0].markup === "x" && b[0].items[1].markup === "y",
    JSON.stringify(b[0]));
}
{
  const b = htmlToBlocks("<ol class=\"op-uc-list\"><li>a</li></ol>");
  check("block: ol ordered", b[0].type === "list" && b[0].ordered === true, JSON.stringify(b[0]));
}
{
  const b = htmlToBlocks("<pre class=\"op-uc-code-block\">line1\nline2\n</pre>");
  check("block: code text raw", b[0].type === "code" && b[0].text === "line1\nline2\n", JSON.stringify(b[0]));
}
// real-world sample from server ---------------------------------------------
{
  const html = "<p class=\"op-uc-p\">N wrote:</p>"
    + "<blockquote class=\"op-uc-blockquote\"><p class=\"op-uc-p\">q "
    + "<a class=\"user-mention op-uc-link\" href=\"/op/users/30\">Имя</a></p></blockquote>"
    + "<p class=\"op-uc-p\">tail</p>";
  const b = htmlToBlocks(html);
  check("sample: three top blocks", b.length === 3, JSON.stringify(b.map((x) => x.type)));
  check("sample: quote has mention link",
    b[1].type === "quote" && b[1].blocks[0].links.length === 1, JSON.stringify(b[1]));
}

// htmlToInlineMarkup: single-line preview ------------------------------------
check("inline: emphasis preserved",
  htmlToInlineMarkup("<p class=\"op-uc-p\">a <strong>b</strong> c</p>") === "a <b>b</b> c",
  htmlToInlineMarkup("<p class=\"op-uc-p\">a <strong>b</strong> c</p>"));
check("inline: blocks joined, whitespace folded",
  htmlToInlineMarkup("<p class=\"op-uc-p\">one</p>\n<p class=\"op-uc-p\">two</p>") === "one two",
  htmlToInlineMarkup("<p class=\"op-uc-p\">one</p>\n<p class=\"op-uc-p\">two</p>"));
check("inline: br folds to space",
  htmlToInlineMarkup("<p class=\"op-uc-p\">a<br>b</p>") === "a b",
  htmlToInlineMarkup("<p class=\"op-uc-p\">a<br>b</p>"));
check("inline: list bullets",
  htmlToInlineMarkup("<ul class=\"op-uc-list\"><li>x</li><li>y</li></ul>") === "• x • y",
  htmlToInlineMarkup("<ul class=\"op-uc-list\"><li>x</li><li>y</li></ul>"));
check("inline: link underlined preserved",
  htmlToInlineMarkup("<p class=\"op-uc-p\">see <a href=\"/x\">z</a></p>")
    === "see <span underline=\"single\">z</span>",
  htmlToInlineMarkup("<p class=\"op-uc-p\">see <a href=\"/x\">z</a></p>"));
check("inline: empty input", htmlToInlineMarkup("") === "" && htmlToInlineMarkup(null) === "");

print(`\n${total - failures}/${total} passed`);
if (failures > 0) imports.system.exit(1);
