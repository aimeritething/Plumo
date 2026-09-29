use serde::{Deserialize, Deserializer};
use std::{
    borrow::Cow,
    collections::{BTreeMap, HashSet},
    error::Error,
    sync::OnceLock,
};
use tauri::{
    menu::{
        MenuBuilder, MenuItem, MenuItemBuilder, MenuItemKind, Submenu, SubmenuBuilder,
        WINDOW_SUBMENU_ID,
    },
    App, AppHandle, Emitter,
};

const APP_COMMAND_MANIFEST_JSON: &str = include_str!("../../src/shell/app-command-manifest.json");
const APP_NAME: &str = "Plumo";
const NOTE_DEPENDENT_GROUP: &str = "noteDependent";
const TAB_DEPENDENT_GROUP: &str = "tabDependent";
const VAULT_DEPENDENT_GROUP: &str = "vaultDependent";
const PINNABLE_DEPENDENT_GROUP: &str = "pinnableDependent";
const RICH_NOTE_DEPENDENT_GROUP: &str = "richNoteDependent";

type MenuResult = Result<Submenu<tauri::Wry>, Box<dyn Error>>;
type AppSubmenuBuilder<'a> = SubmenuBuilder<'a, tauri::Wry, App>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppCommandManifest {
    commands: BTreeMap<String, ManifestCommand>,
    menus: Vec<ManifestMenuSection>,
    app_menu: Vec<ManifestMenuItem>,
    menu_state_groups: BTreeMap<String, Vec<MenuStateGroupReference>>,
}

#[derive(Debug, Deserialize)]
struct ManifestCommand {
    id: String,
    shortcut: Option<ManifestShortcut>,
}

#[derive(Debug, Deserialize)]
struct ManifestShortcut {
    accelerator: String,
}

#[derive(Debug, Deserialize)]
struct ManifestMenuSection {
    label: String,
    items: Vec<ManifestMenuItem>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
enum ManifestMenuItem {
    #[serde(rename = "separator")]
    Separator,
    #[serde(rename = "command")]
    Command {
        command: String,
        id: Option<String>,
        label: PlatformLabel,
        #[serde(default, deserialize_with = "deserialize_accelerator")]
        accelerator: ManifestAccelerator,
        enabled: Option<bool>,
    },
    #[serde(rename = "submenu")]
    Submenu {
        label: PlatformLabel,
        items: Vec<ManifestMenuItem>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum PlatformLabel {
    Plain(String),
    Platform {
        macos: Option<String>,
        windows: Option<String>,
        linux: Option<String>,
        default: String,
    },
}

#[derive(Debug, Default)]
enum ManifestAccelerator {
    #[default]
    Inherit,
    Suppressed,
    Explicit(String),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum MenuStateGroupReference {
    Command { command: String },
    Id { id: String },
}

fn deserialize_accelerator<'de, D>(deserializer: D) -> Result<ManifestAccelerator, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(|accelerator| match accelerator {
        Some(accelerator) => ManifestAccelerator::Explicit(accelerator),
        None => ManifestAccelerator::Suppressed,
    })
}

impl PlatformLabel {
    fn resolve(&self, target_os: &str) -> &str {
        match self {
            Self::Plain(label) => label.as_str(),
            Self::Platform {
                macos,
                windows,
                linux,
                default,
            } => match target_os {
                "macos" => macos.as_deref().unwrap_or(default.as_str()),
                "windows" => windows.as_deref().unwrap_or(default.as_str()),
                "linux" => linux.as_deref().unwrap_or(default.as_str()),
                _ => default.as_str(),
            },
        }
    }
}

impl ManifestMenuItem {
    fn command_id<'a>(&'a self, manifest: &'a AppCommandManifest) -> Option<&'a str> {
        match self {
            Self::Command { command, .. } => manifest
                .commands
                .get(command)
                .map(|command| command.id.as_str()),
            Self::Separator | Self::Submenu { .. } => None,
        }
    }

    fn menu_item_id<'a>(&'a self, manifest: &'a AppCommandManifest) -> Option<&'a str> {
        match self {
            Self::Command { command, id, .. } => id.as_deref().or_else(|| {
                manifest
                    .commands
                    .get(command)
                    .map(|command| command.id.as_str())
            }),
            Self::Separator | Self::Submenu { .. } => None,
        }
    }

    fn label(&self, target_os: &str) -> Option<&str> {
        match self {
            Self::Command { label, .. } | Self::Submenu { label, .. } => {
                Some(label.resolve(target_os))
            }
            Self::Separator => None,
        }
    }

    fn accelerator<'a>(&'a self, manifest: &'a AppCommandManifest) -> Option<&'a str> {
        match self {
            Self::Command {
                command,
                accelerator,
                ..
            } => match accelerator {
                ManifestAccelerator::Explicit(accelerator) => Some(accelerator.as_str()),
                ManifestAccelerator::Suppressed => None,
                ManifestAccelerator::Inherit => manifest
                    .commands
                    .get(command)
                    .and_then(|command| command.shortcut.as_ref())
                    .map(|shortcut| shortcut.accelerator.as_str()),
            },
            Self::Separator | Self::Submenu { .. } => None,
        }
    }

    fn enabled(&self) -> bool {
        match self {
            Self::Command { enabled, .. } => enabled.unwrap_or(true),
            Self::Separator | Self::Submenu { .. } => true,
        }
    }
}

static APP_COMMAND_MANIFEST: OnceLock<AppCommandManifest> = OnceLock::new();
static CUSTOM_MENU_IDS: OnceLock<HashSet<String>> = OnceLock::new();

fn manifest() -> &'static AppCommandManifest {
    APP_COMMAND_MANIFEST.get_or_init(|| {
        serde_json::from_str(APP_COMMAND_MANIFEST_JSON)
            .expect("shared app command manifest must be valid JSON")
    })
}

/// Collect the leaf items (commands and separators) of `items`, descending
/// into nested submenus so their commands register for menu-event dispatch.
fn collect_leaf_menu_items<'a>(
    items: &'a [ManifestMenuItem],
    leaves: &mut Vec<&'a ManifestMenuItem>,
) {
    for item in items {
        match item {
            ManifestMenuItem::Submenu { items, .. } => collect_leaf_menu_items(items, leaves),
            _ => leaves.push(item),
        }
    }
}

fn manifest_menu_items() -> impl Iterator<Item = &'static ManifestMenuItem> {
    let manifest = manifest();
    let mut leaves = Vec::new();
    for section in &manifest.menus {
        collect_leaf_menu_items(&section.items, &mut leaves);
    }
    collect_leaf_menu_items(&manifest.app_menu, &mut leaves);
    leaves.into_iter()
}

fn custom_menu_ids() -> &'static HashSet<String> {
    CUSTOM_MENU_IDS.get_or_init(|| {
        manifest_menu_items()
            .filter_map(|item| item.menu_item_id(manifest()))
            .map(str::to_owned)
            .collect()
    })
}

fn manifest_section(label: &str) -> Result<&'static ManifestMenuSection, Box<dyn Error>> {
    manifest()
        .menus
        .iter()
        .find(|section| section.label == label)
        .ok_or_else(|| format!("Missing menu section in command manifest: {label}").into())
}

fn native_menu_label(label: &str) -> Cow<'_, str> {
    if label.contains('&') {
        Cow::Owned(label.replace('&', "&&"))
    } else {
        Cow::Borrowed(label)
    }
}

fn build_manifest_menu_item(
    app: &App,
    item: &ManifestMenuItem,
) -> Result<Option<MenuItem<tauri::Wry>>, Box<dyn Error>> {
    let Some(id) = item.menu_item_id(manifest()) else {
        return Ok(None);
    };
    let Some(label) = item.label(std::env::consts::OS) else {
        return Ok(None);
    };
    let label = native_menu_label(label);

    let mut builder = MenuItemBuilder::new(label.as_ref())
        .id(id)
        .enabled(item.enabled());
    if let Some(accelerator) = item.accelerator(manifest()) {
        builder = builder.accelerator(accelerator);
    }
    Ok(Some(builder.build(app)?))
}

fn append_manifest_item<'a>(
    app: &'a App,
    builder: AppSubmenuBuilder<'a>,
    item: &ManifestMenuItem,
) -> Result<AppSubmenuBuilder<'a>, Box<dyn Error>> {
    match item {
        ManifestMenuItem::Separator => Ok(builder.separator()),
        ManifestMenuItem::Submenu { label, items } => {
            let submenu = build_manifest_submenu(app, label.resolve(std::env::consts::OS), items)?;
            Ok(builder.item(&submenu))
        }
        ManifestMenuItem::Command { .. } => {
            let Some(item) = build_manifest_menu_item(app, item)? else {
                return Ok(builder);
            };
            Ok(builder.item(&item))
        }
    }
}

fn build_manifest_submenu(app: &App, label: &str, items: &[ManifestMenuItem]) -> MenuResult {
    let label = native_menu_label(label);
    let mut builder = SubmenuBuilder::new(app, label.as_ref());
    for item in items {
        builder = append_manifest_item(app, builder, item)?;
    }
    Ok(builder.build()?)
}

fn build_manifest_menu(app: &App, label: &str) -> MenuResult {
    let section = manifest_section(label)?;
    build_manifest_submenu(app, section.label.as_str(), &section.items)
}

/// The app menu: About, the macOS service and hide items, then the manifest's
/// `appMenu` items. Quit is one of those rather than the predefined item: the
/// predefined one terminates through `applicationWillTerminate`, which reaches
/// the event loop as `Exit` with no way to hold it, while a manifest command
/// lets the renderer write every pending edit first (ADR-0005).
fn build_app_menu(app: &App) -> MenuResult {
    let mut builder = SubmenuBuilder::new(app, APP_NAME)
        .about_with_text(format!("About {APP_NAME}"), None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator();

    for item in &manifest().app_menu {
        builder = append_manifest_item(app, builder, item)?;
    }

    Ok(builder.build()?)
}

fn build_file_menu(app: &App) -> MenuResult {
    build_manifest_menu(app, "File")
}

fn build_edit_menu(app: &App) -> MenuResult {
    let section = manifest_section("Edit")?;
    let mut items = section.items.iter();
    let mut builder = SubmenuBuilder::new(app, "Edit");

    for item in items.by_ref() {
        if matches!(item, ManifestMenuItem::Separator) {
            break;
        }
        builder = append_manifest_item(app, builder, item)?;
    }

    builder = builder.separator().cut().copy().paste();

    if let Some(paste_plain_text) = items.next() {
        builder = append_manifest_item(app, builder, paste_plain_text)?;
    }

    builder = builder.separator().select_all().separator();

    if matches!(items.clone().next(), Some(ManifestMenuItem::Separator)) {
        items.next();
    }

    for item in items {
        builder = append_manifest_item(app, builder, item)?;
    }

    Ok(builder.build()?)
}

fn build_view_menu(app: &App) -> MenuResult {
    build_manifest_menu(app, "View")
}

fn build_window_menu(app: &App) -> MenuResult {
    let section = manifest_section("Window")?;
    // `WINDOW_SUBMENU_ID` is what NSApp recognises as the Window menu, so it
    // lists the open windows and gets the native Zoom / Bring All to Front.
    let mut builder = SubmenuBuilder::new(app, section.label.as_str()).id(WINDOW_SUBMENU_ID);

    for item in &section.items {
        builder = append_manifest_item(app, builder, item)?;
    }

    // No native Close Window item: ⌘W is Close Tab, which closes the window
    // itself once no Tab is left.
    builder = builder.separator().minimize().maximize().fullscreen();

    Ok(builder.build()?)
}

pub fn setup_menu(app: &App) -> Result<(), Box<dyn Error>> {
    let app_menu = build_app_menu(app)?;
    let file_menu = build_file_menu(app)?;
    let edit_menu = build_edit_menu(app)?;
    let view_menu = build_view_menu(app)?;
    let window_menu = build_window_menu(app)?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .build()?;

    app.set_menu(menu)?;

    app.on_menu_event(|app_handle, event| {
        let id = event.id().0.as_str();
        let _ = emit_custom_menu_event(app_handle, id);
    });

    Ok(())
}

fn emitted_menu_event_id(id: &str) -> Option<&'static str> {
    manifest_menu_items().find_map(|item| {
        if item.menu_item_id(manifest()) == Some(id) {
            item.command_id(manifest())
        } else {
            None
        }
    })
}

pub fn emit_custom_menu_event(app_handle: &AppHandle, id: &str) -> Result<(), String> {
    if !custom_menu_ids().contains(id) {
        return Err(format!("Unknown custom menu event: {id}"));
    }
    let emitted_id = emitted_menu_event_id(id)
        .ok_or_else(|| format!("Missing emitted command for custom menu event: {id}"))?;
    app_handle
        .emit("menu-event", emitted_id)
        .map_err(|err| format!("Failed to emit menu-event {emitted_id}: {err}"))
}

fn menu_state_group_ids(group_name: &str) -> Vec<&'static str> {
    manifest()
        .menu_state_groups
        .get(group_name)
        .into_iter()
        .flatten()
        .filter_map(|reference| match reference {
            MenuStateGroupReference::Command { command } => manifest()
                .commands
                .get(command)
                .map(|command| command.id.as_str()),
            MenuStateGroupReference::Id { id } => Some(id.as_str()),
        })
        .collect()
}

fn set_items_enabled<'a>(
    app_handle: &AppHandle,
    ids: impl IntoIterator<Item = &'a str>,
    enabled: bool,
) {
    let Some(menu) = app_handle.menu() else {
        return;
    };
    for id in ids {
        if let Some(MenuItemKind::MenuItem(mi)) = menu.get(id) {
            let _ = mi.set_enabled(enabled);
        }
    }
}

fn set_menu_state_group_enabled(app_handle: &AppHandle, group_name: &str, enabled: bool) {
    set_items_enabled(app_handle, menu_state_group_ids(group_name), enabled);
}

/// Enable or disable menu items that depend on having an active note tab.
pub fn set_note_items_enabled(app_handle: &AppHandle, enabled: bool) {
    set_menu_state_group_enabled(app_handle, NOTE_DEPENDENT_GROUP, enabled);
}

/// Enable or disable menu items that depend on having any Tab open: Close
/// Tab is greyed with zero Tabs while ⌘W itself still reaches the renderer,
/// which closes the window, because a disabled item's accelerator is not
/// consumed by the menu. An Image Tab counts, unlike for the note-dependent
/// group. Copy Path, Reveal in Finder and Open in Default App act on the
/// active Tab's file, so they follow it too.
pub fn set_tab_items_enabled(app_handle: &AppHandle, enabled: bool) {
    set_menu_state_group_enabled(app_handle, TAB_DEPENDENT_GROUP, enabled);
}

/// Enable or disable menu items that depend on having an open vault.
pub fn set_vault_items_enabled(app_handle: &AppHandle, enabled: bool) {
    set_menu_state_group_enabled(app_handle, VAULT_DEPENDENT_GROUP, enabled);
}

/// Enable or disable Pin/Unpin: only a Document or an Image file in the open
/// Folder can be pinned, so a Tab outside it, or no Tab, greys the item.
pub fn set_pinnable_items_enabled(app_handle: &AppHandle, enabled: bool) {
    set_menu_state_group_enabled(app_handle, PINNABLE_DEPENDENT_GROUP, enabled);
}

/// Enable or disable menu items that need a Document in Rich mode, where
/// there are Blocks: Duplicate Block. Greyed in Raw mode, its ⌘D is not
/// consumed by the menu and stays CodeMirror's.
pub fn set_rich_note_items_enabled(app_handle: &AppHandle, enabled: bool) {
    set_menu_state_group_enabled(app_handle, RICH_NOTE_DEPENDENT_GROUP, enabled);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn menu_item_by_id(id: &str) -> &'static ManifestMenuItem {
        manifest_menu_items()
            .find(|item| item.menu_item_id(manifest()) == Some(id))
            .unwrap_or_else(|| panic!("missing menu item {id}"))
    }

    #[test]
    fn custom_ids_are_manifest_menu_item_ids() {
        let expected: HashSet<_> = manifest_menu_items()
            .filter_map(|item| item.menu_item_id(manifest()))
            .map(str::to_owned)
            .collect();

        assert_eq!(custom_menu_ids(), &expected);
        assert!(custom_menu_ids().contains("file-quick-open"));
        assert!(!custom_menu_ids().contains("file-quick-open-alias"));
    }

    #[test]
    fn manifest_command_items_reference_known_commands() {
        for item in manifest_menu_items() {
            if let ManifestMenuItem::Command { command, .. } = item {
                assert!(
                    manifest().commands.contains_key(command),
                    "menu item references missing command key {command}"
                );
            }
        }
    }

    #[test]
    fn menu_sections_are_file_edit_view_window() {
        let labels: Vec<_> = manifest()
            .menus
            .iter()
            .map(|section| section.label.as_str())
            .collect();

        assert_eq!(labels, ["File", "Edit", "View", "Window"]);
    }

    #[test]
    fn app_menu_holds_the_quit_item_with_its_accelerator() {
        let items: Vec<_> = manifest()
            .app_menu
            .iter()
            .map(|item| {
                (
                    item.menu_item_id(manifest()),
                    item.label("macos"),
                    item.label("linux"),
                    item.accelerator(manifest()),
                )
            })
            .collect();

        assert_eq!(
            items,
            [(
                Some("app-quit"),
                Some("Quit Plumo"),
                Some("Quit"),
                Some("CmdOrCtrl+Q")
            )]
        );
        assert!(custom_menu_ids().contains("app-quit"));
        assert_eq!(emitted_menu_event_id("app-quit"), Some("app-quit"));
    }

    #[test]
    fn menu_item_ids_emit_their_command() {
        assert_eq!(emitted_menu_event_id("file-save"), Some("file-save"));
        assert_eq!(
            emitted_menu_event_id("edit-toggle-raw-editor"),
            Some("edit-toggle-raw-editor")
        );
        assert_eq!(emitted_menu_event_id("file-quick-open-alias"), None);
    }

    #[test]
    fn state_group_ids_are_manifest_menu_items() {
        for (group, references) in &manifest().menu_state_groups {
            for reference in references {
                let id = match reference {
                    MenuStateGroupReference::Command { command } => manifest()
                        .commands
                        .get(command)
                        .map(|command| command.id.as_str())
                        .unwrap_or_else(|| panic!("state group {group} references {command}")),
                    MenuStateGroupReference::Id { id } => id.as_str(),
                };
                assert!(
                    custom_menu_ids().contains(id),
                    "state group {group} references non-menu item {id}"
                );
            }
        }
    }

    #[test]
    fn state_groups_are_note_rich_note_tab_vault_and_pinnable_dependent() {
        let groups: Vec<_> = manifest().menu_state_groups.keys().cloned().collect();
        assert_eq!(
            groups,
            [
                NOTE_DEPENDENT_GROUP,
                PINNABLE_DEPENDENT_GROUP,
                RICH_NOTE_DEPENDENT_GROUP,
                TAB_DEPENDENT_GROUP,
                VAULT_DEPENDENT_GROUP
            ]
        );

        assert_eq!(
            menu_state_group_ids(NOTE_DEPENDENT_GROUP),
            [
                "file-save",
                "edit-toggle-raw-editor",
                "edit-find-in-note",
                "edit-undo",
                "edit-redo"
            ]
        );
        assert_eq!(
            menu_state_group_ids(TAB_DEPENDENT_GROUP),
            [
                "file-close-tab",
                "edit-copy-path",
                "file-reveal-in-finder",
                "file-open-in-default-app"
            ]
        );
        assert_eq!(
            menu_state_group_ids(VAULT_DEPENDENT_GROUP),
            ["file-new-note", "file-quick-open", "file-close-vault"]
        );
        assert_eq!(
            menu_state_group_ids(PINNABLE_DEPENDENT_GROUP),
            ["file-toggle-pin"]
        );
        assert_eq!(
            menu_state_group_ids(RICH_NOTE_DEPENDENT_GROUP),
            ["edit-duplicate-block"]
        );
    }

    #[test]
    fn file_menu_accelerators_follow_the_shortcut_table() {
        assert_eq!(
            menu_item_by_id("file-open-vault").accelerator(manifest()),
            Some("CmdOrCtrl+O")
        );
        assert_eq!(
            menu_item_by_id("file-open-note").accelerator(manifest()),
            Some("CmdOrCtrl+Shift+O")
        );
        assert_eq!(
            menu_item_by_id("file-close-tab").accelerator(manifest()),
            Some("CmdOrCtrl+W")
        );
        assert_eq!(
            menu_item_by_id("file-close-vault").accelerator(manifest()),
            None
        );
    }

    #[test]
    fn file_menu_holds_the_active_tabs_file_commands_above_close_tab() {
        let file_menu = manifest_section("File").expect("file menu exists");
        let items: Vec<_> = file_menu
            .items
            .iter()
            .map(|item| (item.menu_item_id(manifest()), item.label("macos")))
            .collect();

        assert_eq!(
            &items[items.len() - 5..],
            [
                (Some("file-toggle-pin"), Some("Pin/Unpin")),
                (Some("file-reveal-in-finder"), Some("Reveal in Finder")),
                (
                    Some("file-open-in-default-app"),
                    Some("Open in Default App")
                ),
                (None, None),
                (Some("file-close-tab"), Some("Close Tab")),
            ]
        );
        for id in [
            "file-toggle-pin",
            "file-reveal-in-finder",
            "file-open-in-default-app",
        ] {
            assert_eq!(menu_item_by_id(id).accelerator(manifest()), None);
            assert_eq!(emitted_menu_event_id(id), Some(id));
        }
    }

    #[test]
    fn edit_menu_keeps_native_item_slots() {
        let edit_menu = manifest_section("Edit").expect("edit menu exists");
        let ids: Vec<_> = edit_menu
            .items
            .iter()
            .map(|item| item.menu_item_id(manifest()))
            .collect();

        assert_eq!(
            ids,
            [
                Some("edit-undo"),
                Some("edit-redo"),
                None,
                Some("edit-paste-plain-text"),
                None,
                Some("edit-duplicate-block"),
                None,
                Some("edit-find-in-note"),
                None,
                Some("edit-copy-path"),
            ]
        );
    }

    #[test]
    fn view_menu_exposes_appearance_submenu() {
        let view_menu = manifest_section("View").expect("view menu exists");
        let submenu = view_menu
            .items
            .iter()
            .find(|item| matches!(item, ManifestMenuItem::Submenu { .. }))
            .expect("View menu exposes the Appearance submenu");

        assert_eq!(submenu.label("macos"), Some("Appearance"));
        assert_eq!(submenu.menu_item_id(manifest()), None);
        assert_eq!(submenu.accelerator(manifest()), None);
        assert!(submenu.enabled());

        let ManifestMenuItem::Submenu { items, .. } = submenu else {
            unreachable!();
        };
        let ids: Vec<_> = items
            .iter()
            .map(|item| item.menu_item_id(manifest()))
            .collect();
        assert_eq!(
            ids,
            [
                Some("view-appearance-system"),
                Some("view-appearance-dark"),
                Some("view-appearance-light"),
            ]
        );
        for item in items {
            assert_eq!(item.accelerator(manifest()), None);
        }
    }

    #[test]
    fn submenu_items_register_for_menu_event_dispatch() {
        for id in [
            "view-appearance-system",
            "view-appearance-dark",
            "view-appearance-light",
        ] {
            assert!(custom_menu_ids().contains(id), "{id} is not registered");
            assert_eq!(emitted_menu_event_id(id), Some(id));
        }
    }

    #[test]
    fn window_menu_exposes_tab_navigation() {
        let window_menu = manifest_section("Window").expect("window menu exists");
        let items: Vec<_> = window_menu
            .items
            .iter()
            .map(|item| {
                (
                    item.menu_item_id(manifest()),
                    item.label("macos"),
                    item.accelerator(manifest()),
                )
            })
            .collect();

        assert_eq!(
            items,
            [
                (
                    Some("window-previous-tab"),
                    Some("Previous Tab"),
                    Some("CmdOrCtrl+Shift+[")
                ),
                (
                    Some("window-next-tab"),
                    Some("Next Tab"),
                    Some("CmdOrCtrl+Shift+]")
                ),
            ]
        );
    }

    #[test]
    fn jump_to_tab_commands_have_no_menu_item() {
        for index in 1..=9 {
            let id = format!("window-jump-to-tab-{index}");
            assert!(
                manifest().commands.values().any(|command| command.id == id),
                "{id} is missing from the manifest"
            );
            assert!(!custom_menu_ids().contains(&id), "{id} has a menu item");
        }
    }

    #[test]
    fn no_duplicate_custom_ids() {
        let mut seen = HashSet::new();
        for id in manifest_menu_items().filter_map(|item| item.menu_item_id(manifest())) {
            assert!(seen.insert(id), "duplicate custom ID: {id}");
        }
    }

    #[test]
    fn native_menu_labels_escape_literal_ampersands() {
        assert_eq!(native_menu_label("Commit & Push"), "Commit && Push");
        assert_eq!(
            native_menu_label("Research && Development"),
            "Research &&&& Development"
        );
    }

    #[test]
    fn native_menu_labels_without_ampersands_are_unchanged() {
        assert_eq!(native_menu_label("Open Folder…"), "Open Folder…");
    }

    #[test]
    fn manifest_menu_labels_are_native_menu_safe() {
        let sections = manifest()
            .menus
            .iter()
            .flat_map(|section| section.items.iter());
        for item in sections.chain(manifest().app_menu.iter()) {
            if let Some(label) = item.label("macos") {
                assert_eq!(native_menu_label(label), label, "{label} needs escaping");
            }
        }
    }
}
