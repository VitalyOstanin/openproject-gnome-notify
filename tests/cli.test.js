// SPDX-License-Identifier: GPL-2.0-or-later
//
// Unit tests for lib/cli.js pagination. Run: gjs -m tests/cli.test.js
//
// The subprocess boundary (runJson) is stubbed so the pagination loop can be
// exercised without the openproject-cli binary or a server.

import { Cli } from "../lib/cli.js";

let failures = 0;
let total = 0;
function check(name, cond, extra) {
  total++;
  const mark = cond ? "OK" : "FAIL";
  if (!cond) failures++;
  print(`[${mark}] ${name}${extra !== undefined ? "  -> " + extra : ""}`);
}

// A stub runJson that serves fixed pages and records the args it was called
// with. Pages are keyed by 1-based offset; a missing offset yields [].
function stubCli(pagesByOffset) {
  const cli = new Cli();
  cli.calls = [];
  cli.runJson = (args) => {
    cli.calls.push(args);
    const i = args.indexOf("--offset");
    const offset = i >= 0 ? Number(args[i + 1]) : 1;
    return Promise.resolve(pagesByOffset[offset] ?? []);
  };
  return cli;
}

function row(spentOn, hours) {
  return { spentOn, hours };
}

// Multiple full pages then a short final page ------------------------------
{
  const full = Array.from({ length: 200 }, (_, i) => row("2026-06-22", i));
  const tail = [row("2026-06-20", 1), row("2026-06-19", 2)];
  const cli = stubCli({ 1: full, 2: full, 3: tail });
  const all = await cli.listMyTime("2026-06-01");
  check("collects every page", all.length === 402, all.length);
  check("stops on the short page (3 requests)", cli.calls.length === 3, cli.calls.length);
  check("keeps tail rows", all[400].spentOn === "2026-06-20" && all[401].spentOn === "2026-06-19");
  check("passes --since through", cli.calls[0].includes("2026-06-01"));
  check("requests page size 200", cli.calls[0][cli.calls[0].indexOf("--limit") + 1] === "200");
}

// Exact multiple of the page size: one extra empty request, then stop -------
{
  const full = Array.from({ length: 200 }, () => row("2026-06-22", 8));
  const cli = stubCli({ 1: full });
  const all = await cli.listMyTime("2026-06-01");
  check("exact multiple: all rows", all.length === 200, all.length);
  check("exact multiple: probes next empty page", cli.calls.length === 2, cli.calls.length);
}

// Empty result (runJson returns null for an empty body) --------------------
{
  const cli = new Cli();
  cli.runJson = () => Promise.resolve(null);
  const all = await cli.listMyTime("2026-06-01");
  check("null body -> empty array", Array.isArray(all) && all.length === 0);
}

// Single short page: one request only --------------------------------------
{
  const cli = stubCli({ 1: [row("2026-07-06", 8), row("2026-07-05", 8)] });
  const all = await cli.listMyTime("2026-07-01");
  check("single short page: one request", cli.calls.length === 1, cli.calls.length);
  check("single short page: rows kept", all.length === 2, all.length);
}

print(`\n${total - failures}/${total} checks passed`);
if (failures > 0) throw new Error(`${failures} check(s) failed`);
