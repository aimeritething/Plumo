use crate::settings::{self, SettingsState};
use serde_json::Value;
use tauri::Manager;

/// The Settings file as it is on disk, or null when there are none. The
/// renderer validates the schema (a bad field falls back to its default).
#[tauri::command]
pub fn read_settings(app_handle: tauri::AppHandle) -> Option<Value> {
    settings::read_settings_file(app_handle.state::<SettingsState>().path())
}

/// A setting changed; the file is written at once.
#[tauri::command]
pub fn update_settings(app_handle: tauri::AppHandle, settings: Value) -> Result<(), String> {
    if !settings.is_object() {
        return Err("Settings must be an object".to_owned());
    }
    let state = app_handle.state::<SettingsState>();
    settings::write_settings_file(state.path(), &settings).map_err(|error| {
        let message = format!(
            "Failed to write the Settings to {}: {error}",
            state.path().display()
        );
        log::error!("{message}");
        message
    })
}
