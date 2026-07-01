// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class OpenProjectNotifyPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage();
    window.add(page);

    const conn = new Adw.PreferencesGroup({
      title: "Connection",
      description:
        "This extension uses the openproject-cli tool for all API access. " +
        "Configure the host and token once with: openproject-cli auth login",
    });
    page.add(conn);

    const startRow = new Adw.EntryRow({ title: "Employment start date (YYYY-MM-DD)" });
    startRow.text = settings.get_string("start-date");
    startRow.connect("changed", () =>
      settings.set_string("start-date", startRow.text.trim()),
    );
    conn.add(startRow);

    const behavior = new Adw.PreferencesGroup({ title: "Behavior" });
    page.add(behavior);

    const interval = new Adw.SpinRow({
      title: "Poll interval (seconds)",
      adjustment: new Gtk.Adjustment({ lower: 30, upper: 3600, step_increment: 30 }),
    });
    settings.bind("poll-interval", interval, "value", Gio.SettingsBindFlags.DEFAULT);
    behavior.add(interval);

    const maxItems = new Adw.SpinRow({
      title: "Max rows in menus",
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 50, step_increment: 1 }),
    });
    settings.bind("max-items", maxItems, "value", Gio.SettingsBindFlags.DEFAULT);
    behavior.add(maxItems);

    const banner = new Adw.SwitchRow({ title: "Show a banner on new notifications" });
    settings.bind("show-banner", banner, "active", Gio.SettingsBindFlags.DEFAULT);
    behavior.add(banner);
  }
}
