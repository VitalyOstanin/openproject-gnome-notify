// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { getToken, setToken, clearToken } from "./lib/secrets.js";

export default class OpenProjectNotifyPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage();
    window.add(page);

    const conn = new Adw.PreferencesGroup({
      title: "Connection",
      description:
        "The API token is stored in the system keyring. After typing it, " +
        "press Enter or the apply button to save.",
    });
    page.add(conn);

    const hostRow = new Adw.EntryRow({ title: "OpenProject base URL" });
    hostRow.text = settings.get_string("host");
    hostRow.connect("changed", () =>
      settings.set_string("host", hostRow.text.trim()),
    );
    conn.add(hostRow);

    const tokenRow = new Adw.PasswordEntryRow({ title: "API token" });
    tokenRow.text = getToken() ?? "";
    tokenRow.show_apply_button = true;
    tokenRow.set_tooltip_text(
      "Personal API token from OpenProject (My account → Access tokens). " +
        "Press Enter or the apply button to save it to the keyring.",
    );
    tokenRow.connect("apply", () => {
      const value = tokenRow.text;
      if (value) setToken(value);
      else clearToken();
      // Signal the running extension to reload the token from the keyring.
      settings.set_int("token-revision", settings.get_int("token-revision") + 1);
    });
    conn.add(tokenRow);

    const behavior = new Adw.PreferencesGroup({ title: "Behavior" });
    page.add(behavior);

    const interval = new Adw.SpinRow({
      title: "Poll interval (seconds)",
      adjustment: new Gtk.Adjustment({
        lower: 30,
        upper: 3600,
        step_increment: 30,
      }),
    });
    settings.bind("poll-interval", interval, "value", Gio.SettingsBindFlags.DEFAULT);
    behavior.add(interval);

    const maxItems = new Adw.SpinRow({
      title: "Max notifications in menu",
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 50,
        step_increment: 1,
      }),
    });
    settings.bind("max-items", maxItems, "value", Gio.SettingsBindFlags.DEFAULT);
    behavior.add(maxItems);

    const banner = new Adw.SwitchRow({
      title: "Show a banner on new notifications",
    });
    settings.bind("show-banner", banner, "active", Gio.SettingsBindFlags.DEFAULT);
    behavior.add(banner);
  }
}
