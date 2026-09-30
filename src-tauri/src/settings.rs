//! The Settings file: one `settings.json` beside `session.json` in the app's
//! config directory (ADR-0004, amended 2026-09-30).
//!
//! The Settings are what the user chose, not what Plumo brings back, so they
//! live apart from the Session: deleting `session.json` to start over keeps
//! them. The Rust side owns the file the same way. The renderer reads it once
//! at launch (`read_settings`) and hands over every change
//! (`update_settings`), which is written atomically at once: a setting changes
//! by hand and rarely, so there is nothing to debounce. The renderer validates
//! the schema; this side treats the contents as opaque JSON.

use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager, Runtime};

use crate::session::write_atomically;

pub const SETTINGS_FILE_NAME: &str = "settings.json";

pub struct SettingsState {
    path: PathBuf,
}

impl SettingsState {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

pub fn settings_path<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join(SETTINGS_FILE_NAME))
}

/// The file's contents, or None when there are no readable Settings (a first
/// launch, or a file that is not JSON; the next write replaces it).
pub fn read_settings_file(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    match serde_json::from_str(&text) {
        Ok(value) => Some(value),
        Err(error) => {
            log::warn!(
                "Ignoring unreadable Settings at {}: {error}",
                path.display()
            );
            None
        }
    }
}

pub fn write_settings_file(path: &Path, settings: &Value) -> io::Result<()> {
    write_atomically(path, settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_missing_file_reads_as_none() {
        let directory = tempfile::tempdir().unwrap();

        assert_eq!(
            read_settings_file(&directory.path().join(SETTINGS_FILE_NAME)),
            None
        );
    }

    #[test]
    fn a_file_that_is_not_json_reads_as_none() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(SETTINGS_FILE_NAME);
        fs::write(&path, "{ not json").unwrap();

        assert_eq!(read_settings_file(&path), None);
    }

    #[test]
    fn a_write_reads_back_and_creates_the_config_directory() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config").join(SETTINGS_FILE_NAME);
        let settings = json!({ "version": 1, "theme": "dark" });

        write_settings_file(&path, &settings).unwrap();

        assert_eq!(read_settings_file(&path), Some(settings));
    }

    #[test]
    fn a_write_replaces_the_previous_settings_and_leaves_no_temp_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(SETTINGS_FILE_NAME);
        write_settings_file(&path, &json!({ "version": 1, "theme": "dark" })).unwrap();

        write_settings_file(&path, &json!({ "version": 1, "theme": "system" })).unwrap();

        assert_eq!(
            read_settings_file(&path),
            Some(json!({ "version": 1, "theme": "system" }))
        );
        let names: Vec<_> = fs::read_dir(directory.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(names, [SETTINGS_FILE_NAME]);
    }
}
