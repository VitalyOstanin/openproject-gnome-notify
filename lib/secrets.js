// SPDX-License-Identifier: GPL-2.0-or-later
//
// API token storage in the system keyring via libsecret. The token never lands
// in GSettings or files.

import Secret from "gi://Secret";

const SCHEMA = new Secret.Schema(
  "org.gnome.shell.extensions.openproject-gnome-notify",
  Secret.SchemaFlags.NONE,
  { service: Secret.SchemaAttributeType.STRING },
);

const ATTRS = { service: "openproject-gnome-notify" };
const LABEL = "OpenProject API token";

export function getToken() {
  try {
    return Secret.password_lookup_sync(SCHEMA, ATTRS, null);
  } catch (e) {
    logError(e, "openproject-gnome-notify: token lookup failed");
    return null;
  }
}

export function setToken(token) {
  return Secret.password_store_sync(
    SCHEMA,
    ATTRS,
    Secret.COLLECTION_DEFAULT,
    LABEL,
    token,
    null,
  );
}

export function clearToken() {
  return Secret.password_clear_sync(SCHEMA, ATTRS, null);
}
