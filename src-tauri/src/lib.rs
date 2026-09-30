mod asset_scope;
mod commands;
pub mod menu;
pub mod open_files;
pub mod session;
pub mod settings;
pub mod vault;
pub mod vault_watcher;

pub(crate) use asset_scope::sync_vault_asset_scope;

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

fn setup_plugins(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    if cfg!(debug_assertions) {
        app.handle().plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )?;
    }

    app.handle().plugin(tauri_plugin_dialog::init())?;
    app.handle().plugin(tauri_plugin_opener::init())?;
    setup_macos_webview_shortcut_prevention(app)?;
    Ok(())
}

/// Browser-reserved chords that WKWebView would swallow before the renderer's
/// shortcut handler sees them: ⌘O (Open Folder…) and ⌘F (Find). Exactly
/// these two are reserved, and no command-shift chord. Keep these lists narrow
/// and verify every addition with native QA.
const MACOS_WEBVIEW_RESERVED_COMMAND_KEYS: &[&str] = &["O", "F"];
const MACOS_WEBVIEW_RESERVED_COMMAND_SHIFT_KEYS: &[&str] = &[];

fn setup_macos_webview_shortcut_prevention(
    app: &mut tauri::App,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_prevent_default::ModifierKey::{MetaKey, ShiftKey};
    use tauri_plugin_prevent_default::{Flags, KeyboardShortcut};

    let mut builder = tauri_plugin_prevent_default::Builder::new().with_flags(Flags::empty());

    for key in MACOS_WEBVIEW_RESERVED_COMMAND_KEYS {
        builder = builder.shortcut(KeyboardShortcut::with_modifiers(key, &[MetaKey]));
    }
    for key in MACOS_WEBVIEW_RESERVED_COMMAND_SHIFT_KEYS {
        builder = builder.shortcut(KeyboardShortcut::with_modifiers(key, &[MetaKey, ShiftKey]));
    }

    app.handle().plugin(builder.build())?;
    Ok(())
}

/// A dev build brings the window forward; it is centred only when no Session
/// frame was restored, so the restored frame is the one you see.
#[cfg(debug_assertions)]
fn show_debug_main_window(app: &mut tauri::App, has_saved_frame: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        if !has_saved_frame {
            let _ = window.center();
        }
        let _ = window.set_focus();
    }
}

#[cfg(not(debug_assertions))]
fn show_debug_main_window(_app: &mut tauri::App, _has_saved_frame: bool) {}

fn setup_session(app: &mut tauri::App) -> Result<bool, Box<dyn std::error::Error>> {
    let path = session::session_path(app.handle())?;
    app.manage(session::SessionState::load(path));
    app.manage(settings::SettingsState::new(settings::settings_path(
        app.handle(),
    )?));
    let has_saved_frame = app.state::<session::SessionState>().window().is_some();
    session::apply_saved_frame(app.handle());
    Ok(has_saved_frame)
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    setup_plugins(app)?;
    menu::setup_menu(app)?;
    let has_saved_frame = setup_session(app)?;
    show_debug_main_window(app, has_saved_frame);
    Ok(())
}

const MAIN_WINDOW_LABEL: &str = "main";

/// The main window's frame follows it into the Session; closing flushes the file.
fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }
    let Some(webview_window) = window.app_handle().get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            session::note_window_frame(&webview_window)
        }
        WindowEvent::CloseRequested { .. } => {
            session::note_window_frame(&webview_window);
            session::flush_now(window.app_handle());
        }
        _ => {}
    }
}

/// Reopen the main window from the Dock after ⌘W closed the last one; the
/// renderer boots and restores the Session as at launch.
fn reopen_main_window(app: &AppHandle) {
    let Some(config) = app.config().app.windows.first().cloned() else {
        log::error!("No window configuration to reopen from");
        return;
    };
    match tauri::WebviewWindowBuilder::from_config(app, &config).and_then(|builder| builder.build())
    {
        Ok(_) => session::apply_saved_frame(app),
        Err(error) => log::error!("Could not reopen the window: {error}"),
    }
}

fn handle_run_event(app: &AppHandle, event: RunEvent) {
    match event {
        // `setup` has run and the logger exists: write out the order in which
        // `Opened` and `Ready` fired on this launch.
        RunEvent::Ready => open_files::mark_ready(app),
        // Finder double-click, Open With and a drop on the Dock icon. Before
        // `Ready` (a launch by document) the paths wait in the buffer for the
        // renderer's drain; after it, the poke reaches the live renderer. With
        // no window to hear it (⌘W closed the last one), the window is
        // recreated and its renderer drains the buffer as at launch.
        RunEvent::Opened { urls } => {
            if open_files::accept(app, &urls) == open_files::Accepted::NeedsWindow {
                reopen_main_window(app);
            }
        }
        // The last window closed (⌘W with zero Tabs): flush the Session and
        // stay in the Dock so a reopen restores it.
        RunEvent::ExitRequested {
            code: None, api, ..
        } => {
            session::flush_now(app);
            api.prevent_exit();
        }
        // ⌘Q ends in the renderer's `quit_app`, which is `app.exit()` and
        // reaches here as `ExitRequested { code: Some(0) }`; a termination
        // from outside the app (Dock, shutdown) arrives as `Exit` alone.
        RunEvent::ExitRequested { .. } | RunEvent::Exit => session::flush_now(app),
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => reopen_main_window(app),
        _ => {}
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(asset_scope::AllowedAssetScopeRoots(std::sync::Mutex::new(
            Vec::new(),
        )))
        .manage(vault_watcher::VaultWatcherState::new())
        // Before `run()`, so the buffer exists when a launch by document
        // delivers `Opened` ahead of `Ready`.
        .manage(open_files::PendingOpen::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_files,
            commands::read_session,
            commands::update_session,
            commands::read_settings,
            commands::update_settings,
            commands::get_note_content,
            commands::save_note_content,
            commands::create_note_content,
            commands::duplicate_vault_file,
            commands::delete_note,
            commands::batch_delete_notes,
            commands::rename_note_filename,
            commands::rename_vault_file,
            commands::move_note_to_folder,
            commands::create_vault_folder,
            commands::rename_vault_folder,
            commands::delete_vault_folder,
            commands::save_image,
            commands::copy_image_to_vault,
            vault_watcher::start_vault_watcher,
            vault_watcher::stop_vault_watcher,
            commands::open_vault_file_external,
            commands::reveal_path_in_file_manager,
            commands::sync_vault_asset_scope_for_window,
            commands::copy_text_to_clipboard,
            commands::read_text_from_clipboard,
            commands::update_menu_state,
            commands::quit_app,
            open_files::take_pending_open,
        ])
        .on_window_event(handle_window_event)
        .setup(setup_app)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(handle_run_event);
}

#[cfg(test)]
mod tests {
    use super::{MACOS_WEBVIEW_RESERVED_COMMAND_KEYS, MACOS_WEBVIEW_RESERVED_COMMAND_SHIFT_KEYS};
    use crate::asset_scope::{missing_asset_scope_roots, vault_asset_scope_roots};
    use std::path::PathBuf;

    #[test]
    fn macos_webview_shortcut_prevention_reserves_open_and_find_only() {
        assert_eq!(MACOS_WEBVIEW_RESERVED_COMMAND_KEYS, ["O", "F"]);
        assert!(MACOS_WEBVIEW_RESERVED_COMMAND_SHIFT_KEYS.is_empty());
    }

    #[test]
    fn vault_asset_scope_roots_include_requested_symlink_path() {
        let directory = tempfile::tempdir().unwrap();
        let canonical_vault = directory.path().join("Getting Started");
        let symlinked_vault = directory.path().join("Symlinked Getting Started");
        std::fs::create_dir(&canonical_vault).unwrap();
        std::os::unix::fs::symlink(&canonical_vault, &symlinked_vault).unwrap();

        let roots = vault_asset_scope_roots(&symlinked_vault).unwrap();

        assert_eq!(roots[0], canonical_vault.canonicalize().unwrap());
        assert!(roots.contains(&symlinked_vault));
    }

    #[test]
    fn missing_asset_scope_roots_keeps_previously_allowed_vaults() {
        let vault_a = PathBuf::from("/vault-a");
        let vault_b = PathBuf::from("/vault-b");
        let allowed_roots = vec![vault_a.clone()];

        assert_eq!(
            missing_asset_scope_roots(&allowed_roots, std::slice::from_ref(&vault_b)),
            vec![vault_b]
        );
        assert!(
            missing_asset_scope_roots(&allowed_roots, std::slice::from_ref(&vault_a)).is_empty()
        );
    }
}
