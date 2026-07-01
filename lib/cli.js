// SPDX-License-Identifier: GPL-2.0-or-later
//
// Runs the openproject-cli binary as an async subprocess and parses its JSON
// stdout. All OpenProject access goes through here; the extension keeps no
// token or host of its own.

import Gio from "gi://Gio";

Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async", "communicate_utf8_finish");

const PROG = "openproject-cli";

export class CliError extends Error {
  // kind: "spawn" (binary missing), "auth" (not configured), "exit" (other).
  constructor(message, kind = "exit") {
    super(message);
    this.name = "CliError";
    this.kind = kind;
  }
}

function classify(stderr) {
  const s = (stderr || "").toLowerCase();
  if (s.includes("auth login") || s.includes("no api token") || s.includes("no openproject url"))
    return "auth";
  return "exit";
}

export class Cli {
  // Run the CLI and return parsed JSON (or null for an empty body). Throws
  // CliError on a missing binary, a non-zero exit, or invalid JSON.
  async runJson(args) {
    let proc;
    try {
      proc = Gio.Subprocess.new(
        [PROG, ...args],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      );
    } catch (e) {
      // G_SPAWN_ERROR_NOENT etc.: the binary is not on the shell's PATH.
      throw new CliError(`cannot run ${PROG}: ${e.message}`, "spawn");
    }
    const [stdout, stderr] = await proc.communicate_utf8_async(null, null);
    const status = proc.get_exit_status();
    if (status !== 0) {
      throw new CliError((stderr || `exit ${status}`).trim(), classify(stderr));
    }
    const text = (stdout || "").trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new CliError(`invalid JSON from ${PROG}: ${e.message}`, "exit");
    }
  }

  listNotifications(limit = 50) {
    return this.runJson(["notification", "list", "--limit", String(limit)]);
  }

  markRead(id) {
    return this.runJson(["notification", "read", String(id)]);
  }

  markUnread(id) {
    return this.runJson(["notification", "unread", String(id)]);
  }

  listMyTasks() {
    return this.runJson(["wp", "list", "--assignee", "me", "--include-past"]);
  }

  listMyTime(sinceDate) {
    return this.runJson(["time", "list", "--user", "me", "--since", sinceDate]);
  }

  getActivity(href) {
    return this.runJson(["api", "GET", href]);
  }

  // { url, tokenConfigured, ... } without contacting the server.
  authStatus() {
    return this.runJson(["auth", "status", "--offline"]);
  }
}
