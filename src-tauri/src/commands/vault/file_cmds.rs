use crate::vault;
use crate::vault::filename_rules::validate_folder_name;
use std::path::{Path, PathBuf};

use super::boundary::{
    with_boundary, with_existing_paths, with_requested_root, with_validated_path, ValidatedPathMode,
};

fn with_note_path<T>(
    path: &Path,
    vault_path: Option<&Path>,
    mode: ValidatedPathMode,
    action: impl FnOnce(&Path) -> Result<T, String>,
) -> Result<T, String> {
    let raw_path = path.to_string_lossy();
    let raw_vault_path = vault_path.map(|value| value.to_string_lossy());
    with_validated_path(
        &raw_path,
        raw_vault_path.as_deref(),
        mode,
        |validated_path| action(Path::new(validated_path)),
    )
}

fn with_external_file_path<T>(
    path: &Path,
    vault_path: Option<&Path>,
    action: impl FnOnce(&Path) -> Result<T, String>,
) -> Result<T, String> {
    with_note_path(path, vault_path, ValidatedPathMode::Existing, action)
}

fn with_requested_root_path<T>(
    vault_path: &Path,
    action: impl FnOnce(&str) -> Result<T, String>,
) -> Result<T, String> {
    let raw_vault_path = vault_path.to_string_lossy();
    with_requested_root(raw_vault_path.as_ref(), action)
}

fn sync_image_asset_scope(
    app_handle: &tauri::AppHandle,
    requested_root: &str,
) -> Result<(), String> {
    crate::sync_vault_asset_scope(app_handle, Path::new(requested_root))
}

fn with_image_asset_scope(
    app_handle: &tauri::AppHandle,
    vault_path: &Path,
    action: impl FnOnce(&str) -> Result<String, String>,
) -> Result<String, String> {
    with_requested_root_path(vault_path, |requested_root| {
        let saved_path = action(requested_root)?;
        sync_image_asset_scope(app_handle, requested_root)?;
        Ok(saved_path)
    })
}

#[tauri::command]
pub fn sync_vault_asset_scope_for_window(
    app_handle: tauri::AppHandle,
    vault_path: PathBuf,
) -> Result<(), String> {
    with_requested_root_path(vault_path.as_path(), |requested_root| {
        sync_image_asset_scope(&app_handle, requested_root)
    })
}

#[tauri::command]
pub fn open_vault_file_external(
    app_handle: tauri::AppHandle,
    path: PathBuf,
    vault_path: Option<PathBuf>,
) -> Result<(), String> {
    with_external_file_path(path.as_path(), vault_path.as_deref(), |validated_path| {
        open_path_with_default_app(&app_handle, validated_path)
    })
}

fn open_path_with_default_app(app_handle: &tauri::AppHandle, path: &Path) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    app_handle
        .opener()
        .open_path(path.to_string_lossy().into_owned(), None::<String>)
        .map_err(|error| error.to_string())
}

/// Reveal in Finder: select the file or folder in its parent window.
#[tauri::command]
pub fn reveal_path_in_file_manager(
    app_handle: tauri::AppHandle,
    path: PathBuf,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    ensure_path_exists(path.as_path())?;
    app_handle
        .opener()
        .reveal_item_in_dir(path)
        .map_err(|error| error.to_string())
}

fn ensure_path_exists(path: &Path) -> Result<(), String> {
    if !path
        .try_exists()
        .map_err(|error| format!("Failed to inspect path: {error}"))?
    {
        return Err(format!("Path does not exist: {}", path.display()));
    }
    Ok(())
}

fn with_writable_note_path<T>(
    path: PathBuf,
    vault_path: Option<PathBuf>,
    action: impl FnOnce(&str) -> Result<T, String>,
) -> Result<T, String> {
    with_validated_path(
        path.to_string_lossy().as_ref(),
        vault_path
            .as_ref()
            .map(|value| value.to_string_lossy())
            .as_deref(),
        ValidatedPathMode::Writable,
        action,
    )
}

#[tauri::command]
pub fn get_note_content(path: PathBuf, vault_path: Option<PathBuf>) -> Result<String, String> {
    with_note_path(
        path.as_path(),
        vault_path.as_deref(),
        ValidatedPathMode::Existing,
        vault::get_note_content,
    )
}

#[tauri::command]
pub async fn save_note_content(
    path: PathBuf,
    content: String,
    vault_path: Option<PathBuf>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        with_writable_note_path(path, vault_path, |validated_path| {
            vault::save_note_content(validated_path, &content)
        })
    })
    .await
    .map_err(|e| format!("Task panicked: {e}"))?
}

#[tauri::command]
pub fn create_note_content(
    path: PathBuf,
    content: String,
    vault_path: Option<PathBuf>,
) -> Result<(), String> {
    with_writable_note_path(path, vault_path, |validated_path| {
        vault::create_note_content(validated_path, &content)
    })
}

/// Duplicate: copy a Document's or an Image file's bytes to `new_path`, beside
/// it. Both paths must stay inside `vault_path`, the file's boundary root.
#[tauri::command]
pub fn duplicate_vault_file(
    path: PathBuf,
    new_path: PathBuf,
    vault_path: Option<PathBuf>,
) -> Result<(), String> {
    let destination_root = vault_path.clone();
    with_note_path(
        path.as_path(),
        vault_path.as_deref(),
        ValidatedPathMode::Existing,
        |validated_source| {
            with_writable_note_path(new_path, destination_root, |validated_destination| {
                vault::duplicate_file(&validated_source.to_string_lossy(), validated_destination)
            })
        },
    )
}

/// Move a note to the Trash. `vault_path` is required: the boundary has no
/// registry to look a bare path up in.
#[tauri::command]
pub fn delete_note(path: PathBuf, vault_path: Option<PathBuf>) -> Result<String, String> {
    with_note_path(
        path.as_path(),
        vault_path.as_deref(),
        ValidatedPathMode::Existing,
        |validated_path| vault::delete_note(&validated_path.to_string_lossy()),
    )
}

/// Move several notes to the Trash. `vault_path` is required (see [`delete_note`]).
#[tauri::command]
pub fn batch_delete_notes(
    paths: Vec<PathBuf>,
    vault_path: Option<PathBuf>,
) -> Result<Vec<String>, String> {
    let raw_paths = paths
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    let raw_vault_path = vault_path.as_ref().map(|value| value.to_string_lossy());
    with_existing_paths(&raw_paths, raw_vault_path.as_deref(), |validated_paths| {
        vault::batch_delete_notes(&validated_paths)
    })
}

#[tauri::command]
pub fn create_vault_folder(
    vault_path: PathBuf,
    folder_name: PathBuf,
    parent_path: Option<PathBuf>,
) -> Result<String, String> {
    let raw_vault_path = vault_path.to_string_lossy();
    with_boundary(Some(raw_vault_path.as_ref()), |boundary| {
        let folder_name = folder_name.to_string_lossy();
        let relative_path = match parent_path.as_deref() {
            Some(parent) if !parent.as_os_str().is_empty() => parent.join(folder_name.as_ref()),
            _ => PathBuf::from(folder_name.as_ref()),
        };
        let folder_path = boundary.child_path(&relative_path.to_string_lossy())?;
        validate_folder_name(folder_name.as_ref())?;
        ensure_missing_folder(&folder_path, folder_name.as_ref())?;
        std::fs::create_dir_all(&folder_path)
            .map_err(|e| format!("Failed to create folder: {}", e))?;
        Ok(folder_name.into_owned())
    })
}

fn ensure_missing_folder(folder_path: &Path, folder_name: &str) -> Result<(), String> {
    if folder_path.exists() {
        return Err(format!("Folder '{}' already exists", folder_name));
    }
    Ok(())
}

#[tauri::command]
pub fn save_image(
    app_handle: tauri::AppHandle,
    vault_path: PathBuf,
    filename: String,
    data: String,
) -> Result<String, String> {
    with_image_asset_scope(&app_handle, vault_path.as_path(), |requested_root| {
        vault::save_image(requested_root, &filename, &data)
    })
}

#[tauri::command]
pub fn copy_image_to_vault(
    app_handle: tauri::AppHandle,
    vault_path: PathBuf,
    source_path: PathBuf,
) -> Result<String, String> {
    with_image_asset_scope(&app_handle, vault_path.as_path(), |requested_root| {
        vault::copy_image_to_vault(requested_root, source_path.to_string_lossy().as_ref())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn vault_root(dir: &TempDir) -> PathBuf {
        dir.path().to_path_buf()
    }

    fn note_path(dir: &TempDir, name: &str) -> PathBuf {
        dir.path().join(name)
    }

    #[test]
    fn duplicate_vault_file_copies_beside_the_original_inside_the_root() {
        let dir = TempDir::new().unwrap();
        let root = vault_root(&dir);
        fs::create_dir(root.join("notes")).unwrap();
        let note = note_path(&dir, "notes/Plan.md");
        fs::write(&note, "# Plan\n").unwrap();
        let copy = note_path(&dir, "notes/Plan copy.md");

        duplicate_vault_file(note, copy.clone(), Some(root)).unwrap();

        assert_eq!(fs::read_to_string(copy).unwrap(), "# Plan\n");
    }

    #[test]
    fn duplicate_vault_file_rejects_a_source_outside_the_root() {
        let outer = TempDir::new().unwrap();
        let root = outer.path().join("folder");
        fs::create_dir(&root).unwrap();
        let outside = outer.path().join("Outside.md");
        fs::write(&outside, "# Outside\n").unwrap();

        let result =
            duplicate_vault_file(outside, outer.path().join("Outside copy.md"), Some(root));

        assert!(result.is_err());
        assert!(!outer.path().join("Outside copy.md").exists());
    }

    #[tokio::test]
    async fn note_content_commands_roundtrip_with_requested_vault() {
        let dir = TempDir::new().unwrap();
        let root = vault_root(&dir);
        let note = note_path(&dir, "notes/command-note.md");

        create_note_content(
            note.clone(),
            "# Command Note\n".to_string(),
            Some(root.clone()),
        )
        .unwrap();
        assert_eq!(
            get_note_content(note.clone(), Some(root.clone())).unwrap(),
            "# Command Note\n"
        );

        save_note_content(
            note.clone(),
            "# Updated Command Note\n".to_string(),
            Some(root.clone()),
        )
        .await
        .unwrap();
        assert_eq!(
            get_note_content(note, Some(root)).unwrap(),
            "# Updated Command Note\n"
        );
    }

    #[tokio::test]
    async fn note_content_commands_accept_windows_sensitive_valid_segments() {
        let dir = TempDir::new().unwrap();
        let root = vault_root(&dir);
        let note = root
            .join("@raflymln")
            .join("notes with spaces")
            .join("résumé note.md");

        save_note_content(
            note.clone(),
            "# Windows-Sensitive Path\n\nBody\n".to_string(),
            Some(root.clone()),
        )
        .await
        .unwrap();

        assert_eq!(
            get_note_content(note, Some(root)).unwrap(),
            "# Windows-Sensitive Path\n\nBody\n"
        );
    }

    #[test]
    fn commands_reject_paths_outside_requested_vault() {
        let vault = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let outside_note = outside.path().join("outside.md");
        fs::write(&outside_note, "# Outside\n").unwrap();

        let error = get_note_content(outside_note, Some(vault.path().to_path_buf())).unwrap_err();
        assert!(error.contains("Path must stay inside the active vault"));

        let folder_error =
            create_vault_folder(vault.path().to_path_buf(), PathBuf::from("../escape"), None)
                .unwrap_err();
        assert!(folder_error.contains("Path must stay inside the active vault"));
    }

    #[test]
    fn delete_commands_require_a_vault_and_reject_paths_outside_it() {
        let vault = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let inside_note = vault.path().join("inside.md");
        let outside_note = outside.path().join("outside.md");
        fs::write(&inside_note, "# Inside\n").unwrap();
        fs::write(&outside_note, "# Outside\n").unwrap();

        let error = delete_note(inside_note.clone(), None).unwrap_err();
        assert_eq!(error, super::super::boundary::NO_ACTIVE_VAULT_ERROR);

        let error =
            delete_note(outside_note.clone(), Some(vault.path().to_path_buf())).unwrap_err();
        assert!(error.contains("Path must stay inside the active vault"));

        let error = batch_delete_notes(
            vec![inside_note.clone(), outside_note],
            Some(vault.path().to_path_buf()),
        )
        .unwrap_err();
        assert!(error.contains("Path must stay inside the active vault"));

        assert!(inside_note.exists());
    }

    #[test]
    fn external_file_paths_accept_files_inside_requested_vault() {
        let dir = TempDir::new().unwrap();
        let root = vault_root(&dir);
        let attachment = note_path(&dir, "attachments/photo.png");
        fs::create_dir_all(attachment.parent().unwrap()).unwrap();
        fs::write(&attachment, "image-bytes").unwrap();

        let validated = with_external_file_path(
            attachment.as_path(),
            Some(root.as_path()),
            |validated_path| Ok(validated_path.to_path_buf()),
        )
        .unwrap();

        assert_eq!(validated, attachment);
    }

    #[test]
    fn external_file_paths_reject_files_outside_requested_vault() {
        let vault = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let outside_file = outside.path().join("photo.png");
        fs::write(&outside_file, "image-bytes").unwrap();

        let error = with_external_file_path(
            outside_file.as_path(),
            Some(vault.path()),
            |validated_path| Ok(validated_path.to_path_buf()),
        )
        .unwrap_err();

        assert!(error.contains("Path must stay inside the active vault"));
    }

    #[test]
    fn file_manager_reveal_accepts_existing_paths_and_rejects_missing_ones() {
        let dir = TempDir::new().unwrap();
        let nested = dir.path().join("Folder With Spaces").join("Nested");
        fs::create_dir_all(&nested).unwrap();
        let missing = dir.path().join("missing");

        assert_eq!(ensure_path_exists(nested.as_path()), Ok(()));

        let error = ensure_path_exists(missing.as_path()).unwrap_err();
        assert!(error.starts_with("Path does not exist: "));
        assert!(error.contains("missing"));
    }
}
