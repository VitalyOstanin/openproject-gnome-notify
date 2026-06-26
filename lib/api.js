// SPDX-License-Identifier: GPL-2.0-or-later
//
// OpenProject REST client over libsoup3. Verified endpoints:
//   GET  /api/v3/notifications?pageSize=N&sortBy=[["id","desc"]]
//   POST /api/v3/notifications/{id}/read_ian      (needs Accept: application/json)
//   POST /api/v3/notifications/{id}/unread_ian    (needs Accept: application/json)
// Auth: HTTP Basic, user "apikey", password = personal API token.

import Soup from "gi://Soup?version=3.0";
import GLib from "gi://GLib";
import Gio from "gi://Gio";

import { parseNotifications } from "./parse.js";
import { getTokenAsync } from "./secrets.js";

Gio._promisify(
  Soup.Session.prototype,
  "send_and_read_async",
  "send_and_read_finish",
);

export class TokenError extends Error {}
export class NotConfiguredError extends Error {}

export class OpenProjectClient {
  constructor(host) {
    this._host = String(host || "").replace(/\/+$/, "");
    this._session = new Soup.Session();
    this._session.timeout = 15;
    this._token = null;
    this._tokenLoaded = false;
  }

  destroy() {
    if (this._session) {
      this._session.abort();
      this._session = null;
    }
  }

  // Load the token from the keyring once and cache it, so the request path stays
  // free of (synchronous) keyring access on the compositor main loop.
  async _ensureToken() {
    if (this._tokenLoaded) return;
    this._token = await getTokenAsync();
    this._tokenLoaded = true;
  }

  // Drop the cached token so the next request re-reads it (e.g. after the user
  // changes it in preferences).
  reloadToken() {
    this._token = null;
    this._tokenLoaded = false;
  }

  _authHeader() {
    if (!this._token) return null;
    const bytes = new TextEncoder().encode(`apikey:${this._token}`);
    return `Basic ${GLib.base64_encode(bytes)}`;
  }

  _message(method, path) {
    if (!this._host) throw new NotConfiguredError("host not set");
    const msg = Soup.Message.new(method, `${this._host}/api/v3${path}`);
    if (!msg) throw new NotConfiguredError(`invalid host URL: ${this._host}`);
    const auth = this._authHeader();
    const headers = msg.get_request_headers();
    if (auth) headers.append("Authorization", auth);
    headers.append("Accept", "application/json");
    return { msg, hasAuth: Boolean(auth) };
  }

  async listNotifications(pageSize = 50) {
    await this._ensureToken();
    const sort = encodeURIComponent(JSON.stringify([["id", "desc"]]));
    const { msg, hasAuth } = this._message(
      "GET",
      `/notifications?pageSize=${pageSize}&sortBy=${sort}`,
    );
    if (!hasAuth) throw new TokenError("no token");

    const bytes = await this._session.send_and_read_async(
      msg,
      GLib.PRIORITY_DEFAULT,
      null,
    );
    const status = msg.get_status();
    if (status === Soup.Status.UNAUTHORIZED) throw new TokenError("unauthorized");
    if (status !== Soup.Status.OK) throw new Error(`list failed: HTTP ${status}`);

    const text = new TextDecoder().decode(bytes.get_data());
    return parseNotifications(JSON.parse(text));
  }

  async _post(path) {
    await this._ensureToken();
    const { msg, hasAuth } = this._message("POST", path);
    if (!hasAuth) throw new TokenError("no token");
    msg.get_request_headers().append("Content-Type", "application/json");

    await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
    const status = msg.get_status();
    if (status === Soup.Status.UNAUTHORIZED) throw new TokenError("unauthorized");
    if (status !== Soup.Status.NO_CONTENT && status !== Soup.Status.OK)
      throw new Error(`post ${path} failed: HTTP ${status}`);
  }

  markRead(id) {
    return this._post(`/notifications/${id}/read_ian`);
  }

  markUnread(id) {
    return this._post(`/notifications/${id}/unread_ian`);
  }

  async markAllRead(ids) {
    for (const id of ids) await this.markRead(id);
  }
}
