//! The Update: a newer Plumo, found in the release manifest on GitHub and
//! downloaded in the background, that waits here until the renderer asks for
//! it to be installed.
//!
//! The renderer owns when to check (after launch, once a day, the Plumo
//! menu's Check for Updates…) and what to show; this side owns the bytes. A
//! check that finds a newer version downloads it before it answers, so the
//! renderer only ever hears of an Update that is ready to install. The
//! download's signature is verified by the plugin against the public key in
//! `tauri.conf.json` (`plugins.updater.pubkey`).

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// A downloaded Update, with the bytes the install step unpacks.
struct ReadyUpdate {
    update: Update,
    bytes: Vec<u8>,
}

/// The Update that has been downloaded and not yet installed, if any.
#[derive(Default)]
pub struct UpdateState(Mutex<Option<ReadyUpdate>>);

/// What the renderer shows about an Update: its version, and its section of
/// `CHANGELOG.md` as the release manifest carries it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
}

fn info_of(update: &Update) -> UpdateInfo {
    UpdateInfo {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
    }
}

/// A build made by `pnpm tauri dev` never looks for an Update: it runs under
/// the dev identifier beside an installed Plumo and must not replace itself.
fn checks_for_updates() -> bool {
    !cfg!(debug_assertions)
}

/// Look for a newer Plumo and download it. `None`: this is the newest
/// version. `Some`: that version is downloaded, verified and ready to
/// install. An Update that is already waiting is answered without another
/// download. Every failure (offline, GitHub unreachable, a bad signature)
/// is an `Err` the renderer decides whether to show.
#[tauri::command]
pub async fn check_for_update(
    app_handle: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<Option<UpdateInfo>, String> {
    if !checks_for_updates() {
        return Ok(None);
    }

    let update = app_handle
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;
    let Some(update) = update else {
        return Ok(None);
    };

    let waiting = state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .as_ref()
        .map(|ready| ready.update.version.clone());
    if waiting.as_deref() == Some(update.version.as_str()) {
        return Ok(Some(info_of(&update)));
    }

    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    let info = info_of(&update);
    *state.0.lock().map_err(|error| error.to_string())? = Some(ReadyUpdate { update, bytes });
    Ok(Some(info))
}

/// Install the waiting Update and restart into it. The renderer calls this
/// as the last step of its quit sequence (ADR-0005), in place of `quit_app`,
/// so every pending edit is on disk by now. The restart leaves through
/// `ExitRequested`, where the Session file is flushed (ADR-0004). An install
/// that fails keeps the Update for another try and leaves Plumo running.
#[tauri::command]
pub fn install_update(app_handle: AppHandle) -> Result<(), String> {
    let state = app_handle.state::<UpdateState>();
    let mut waiting = state.0.lock().map_err(|error| error.to_string())?;
    let Some(ready) = waiting.as_ref() else {
        return Err("No Update is waiting to be installed".to_string());
    };
    ready
        .update
        .install(&ready.bytes)
        .map_err(|error| error.to_string())?;
    *waiting = None;
    drop(waiting);
    app_handle.request_restart();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::checks_for_updates;

    #[test]
    fn a_debug_build_never_checks_for_updates() {
        assert_eq!(checks_for_updates(), !cfg!(debug_assertions));
    }
}
