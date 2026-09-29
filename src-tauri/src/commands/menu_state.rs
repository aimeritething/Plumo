use crate::menu;
use serde::Deserialize;

/// What the renderer knows about the enable state of the manifest's menu
/// groups: `noteDependent` follows the active Document,
/// `tabDependent` any open Tab (an Image Tab included), `vaultDependent`
/// the open Folder and `pinnableDependent` whether the active Tab's file can
/// be pinned (a Document or an Image file in the Folder) and
/// `richNoteDependent` whether the active Document is in Rich mode. A missing
/// `hasVault`, `hasTab`, `canPin` or `hasRichNote` leaves that group as it
/// is, so a shell that has no Folder concept yet only drives the first.
#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MenuStateUpdate {
    pub has_active_note: bool,
    #[serde(default)]
    pub has_vault: Option<bool>,
    #[serde(default)]
    pub has_tab: Option<bool>,
    #[serde(default)]
    pub can_pin: Option<bool>,
    #[serde(default)]
    pub has_rich_note: Option<bool>,
}

#[tauri::command]
pub fn update_menu_state(
    app_handle: tauri::AppHandle,
    state: MenuStateUpdate,
) -> Result<(), String> {
    menu::set_note_items_enabled(&app_handle, state.has_active_note);
    if let Some(has_vault) = state.has_vault {
        menu::set_vault_items_enabled(&app_handle, has_vault);
    }
    if let Some(has_tab) = state.has_tab {
        menu::set_tab_items_enabled(&app_handle, has_tab);
    }
    if let Some(can_pin) = state.can_pin {
        menu::set_pinnable_items_enabled(&app_handle, can_pin);
    }
    if let Some(has_rich_note) = state.has_rich_note {
        menu::set_rich_note_items_enabled(&app_handle, has_rich_note);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_state_reads_the_renderer_payload() {
        let state: MenuStateUpdate = serde_json::from_str(
            r#"{"hasActiveNote":true,"hasVault":false,"hasTab":true,"canPin":true,"hasRichNote":true}"#,
        )
        .unwrap();

        assert_eq!(
            state,
            MenuStateUpdate {
                has_active_note: true,
                has_vault: Some(false),
                has_tab: Some(true),
                can_pin: Some(true),
                has_rich_note: Some(true),
            }
        );
    }

    #[test]
    fn menu_state_leaves_the_folder_group_alone_when_unspecified() {
        let state: MenuStateUpdate = serde_json::from_str(r#"{"hasActiveNote":false}"#).unwrap();

        assert_eq!(state.has_vault, None);
        assert_eq!(state.has_tab, None);
        assert_eq!(state.can_pin, None);
        assert_eq!(state.has_rich_note, None);
    }
}
