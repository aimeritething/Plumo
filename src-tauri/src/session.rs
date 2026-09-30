//! The Session file: one `session.json` in the app's config
//! directory, `~/Library/Application Support/com.aimerite.plumo/` on macOS.
//!
//! The Rust side owns the file. The renderer hands over its part of the
//! Session (`update_session`) whenever it changes and reads the file back once
//! at launch (`read_session`). That part includes each Folder's Pinned list,
//! keyed by the Folder's path, which is why it lives here rather than in the
//! Folder; this module merges the window frame in, writes
//! the file atomically (temp file + rename) about 500 ms after the last change
//! from either side, and flushes it once more when the window closes and when
//! the app exits.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Runtime, WebviewWindow};

pub const SESSION_FILE_NAME: &str = "session.json";
pub const SESSION_VERSION: u64 = 1;
const WRITE_DEBOUNCE: Duration = Duration::from_millis(500);
const MAIN_WINDOW_LABEL: &str = "main";
/// How much of a restored window must land on a screen for the frame to be used.
const MIN_VISIBLE_WIDTH: u32 = 64;
const MIN_VISIBLE_HEIGHT: u32 = 32;

/// The window's outer frame in logical pixels, as the schema's `window`
/// object. Also the shape of a screen when the frame is checked against one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WindowFrame {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Default)]
struct SessionInner {
    /// The renderer's part of the Session, seeded from the file at launch so a
    /// window move before the renderer reports never erases the open Tabs.
    renderer: Option<Value>,
    window: Option<WindowFrame>,
    /// Bumped on every change; a debounced write only lands if it is still current.
    generation: u64,
}

pub struct SessionState {
    path: PathBuf,
    inner: Mutex<SessionInner>,
}

impl SessionState {
    /// Seed the in-memory Session from the file, or from nothing when there is
    /// none or its `version` is unknown (the renderer rewrites that one).
    pub fn load(path: PathBuf) -> Self {
        let stored = read_session_file(&path).filter(is_current_version);
        let window = stored.as_ref().and_then(frame_from_session);
        Self {
            path,
            inner: Mutex::new(SessionInner {
                renderer: stored,
                window,
                generation: 0,
            }),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, SessionInner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Replace the renderer's part of the Session; returns the generation to write.
    pub fn update_renderer(&self, session: Value) -> u64 {
        let mut inner = self.lock();
        inner.renderer = Some(session);
        inner.generation += 1;
        inner.generation
    }

    pub fn update_window(&self, frame: WindowFrame) -> u64 {
        let mut inner = self.lock();
        inner.window = Some(frame);
        inner.generation += 1;
        inner.generation
    }

    pub fn window(&self) -> Option<WindowFrame> {
        self.lock().window
    }

    pub fn is_current(&self, generation: u64) -> bool {
        self.lock().generation == generation
    }

    /// The file's next contents: the renderer's Session with the window frame merged in.
    pub fn merged(&self) -> Value {
        let inner = self.lock();
        merge_window(inner.renderer.as_ref(), inner.window)
    }

    /// Write the merged Session now.
    pub fn flush(&self) -> io::Result<()> {
        write_atomically(&self.path, &self.merged())
    }
}

fn default_session() -> Value {
    json!({
        "version": SESSION_VERSION,
        "folder": null,
        "openEditors": [],
        "activePath": null,
        "sidebar": { "collapsed": false, "width": 260 },
        "pinned": {},
    })
}

/// The renderer's Session (or the empty default) with `window` set from `frame`.
pub fn merge_window(renderer: Option<&Value>, frame: Option<WindowFrame>) -> Value {
    let mut session = match renderer {
        Some(Value::Object(fields)) => Value::Object(fields.clone()),
        _ => default_session(),
    };
    if let (Some(frame), Value::Object(fields)) = (frame, &mut session) {
        fields.insert(
            "window".to_owned(),
            serde_json::to_value(frame).expect("a window frame serialises"),
        );
    }
    session
}

fn is_current_version(session: &Value) -> bool {
    session.get("version").and_then(Value::as_u64) == Some(SESSION_VERSION)
}

/// The saved window frame, only from a Session in the current schema.
pub fn frame_from_session(session: &Value) -> Option<WindowFrame> {
    if !is_current_version(session) {
        return None;
    }
    serde_json::from_value(session.get("window")?.clone()).ok()
}

/// The file's contents, or None when there is no readable Session (a first
/// launch, or a file that is not JSON; the next write replaces it).
pub fn read_session_file(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    match serde_json::from_str(&text) {
        Ok(value) => Some(value),
        Err(error) => {
            log::warn!(
                "Ignoring an unreadable Session at {}: {error}",
                path.display()
            );
            None
        }
    }
}

/// Write `session` through a temp file beside `path` and rename it into place,
/// so a crash mid-write leaves the previous file intact. The Settings file is
/// written the same way.
pub fn write_atomically(path: &Path, session: &Value) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no parent"))?;
    fs::create_dir_all(parent)?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(SESSION_FILE_NAME);
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", std::process::id()));
    let mut text = serde_json::to_string_pretty(session).map_err(io::Error::other)?;
    text.push('\n');
    let result = fs::write(&temp_path, text).and_then(|_| fs::rename(&temp_path, path));
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

/// Whether enough of the frame lands on one of `screens` (same units) to be worth restoring.
pub fn frame_is_on_screen(frame: &WindowFrame, screens: &[WindowFrame]) -> bool {
    screens.iter().any(|screen| {
        let left = frame.x.max(screen.x);
        let top = frame.y.max(screen.y);
        let right =
            (frame.x as i64 + frame.width as i64).min(screen.x as i64 + screen.width as i64);
        let bottom =
            (frame.y as i64 + frame.height as i64).min(screen.y as i64 + screen.height as i64);
        right - left as i64 >= MIN_VISIBLE_WIDTH as i64
            && bottom - top as i64 >= MIN_VISIBLE_HEIGHT as i64
    })
}

pub fn session_path<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join(SESSION_FILE_NAME))
}

fn log_flush_failure(state: &SessionState, error: io::Error) {
    log::error!(
        "Failed to write the Session to {}: {error}",
        state.path().display()
    );
}

/// Write the Session now: the window is closing or the app is exiting.
pub fn flush_now<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<SessionState>();
    if let Err(error) = state.flush() {
        log_flush_failure(&state, error);
    }
}

/// Write the Session ~500 ms after the last change; a later change supersedes a pending write.
fn schedule_write<R: Runtime>(app: &AppHandle<R>, generation: u64) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(WRITE_DEBOUNCE).await;
        let state = app.state::<SessionState>();
        if !state.is_current(generation) {
            return;
        }
        if let Err(error) = state.flush() {
            log_flush_failure(&state, error);
        }
    });
}

/// The renderer's part of the Session changed.
pub fn update_renderer_session<R: Runtime>(app: &AppHandle<R>, session: Value) {
    let generation = app.state::<SessionState>().update_renderer(session);
    schedule_write(app, generation);
}

/// The window's current outer frame in logical pixels.
pub fn current_frame<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<WindowFrame> {
    let scale = window.scale_factor()?;
    let position = window.outer_position()?.to_logical::<f64>(scale);
    let size = window.outer_size()?.to_logical::<f64>(scale);
    Ok(WindowFrame {
        x: position.x.round() as i32,
        y: position.y.round() as i32,
        width: size.width.round() as u32,
        height: size.height.round() as u32,
    })
}

/// The main window moved or resized: remember its frame and schedule a write.
pub fn note_window_frame<R: Runtime>(window: &WebviewWindow<R>) {
    match current_frame(window) {
        Ok(frame) => {
            let app = window.app_handle();
            let generation = app.state::<SessionState>().update_window(frame);
            schedule_write(app, generation);
        }
        Err(error) => log::warn!("Could not read the window frame: {error}"),
    }
}

/// Every screen in logical pixels, each through its own scale factor.
fn screens_in_logical_pixels<R: Runtime>(
    window: &WebviewWindow<R>,
) -> tauri::Result<Vec<WindowFrame>> {
    Ok(window
        .available_monitors()?
        .iter()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let position = monitor.position().to_logical::<f64>(scale);
            let size = monitor.size().to_logical::<f64>(scale);
            WindowFrame {
                x: position.x.round() as i32,
                y: position.y.round() as i32,
                width: size.width.round() as u32,
                height: size.height.round() as u32,
            }
        })
        .collect())
}

/// Put the window back where the Session left it, unless that is off every screen.
pub fn restore_window_frame<R: Runtime>(
    window: &WebviewWindow<R>,
    frame: WindowFrame,
) -> tauri::Result<()> {
    if !frame_is_on_screen(&frame, &screens_in_logical_pixels(window)?) {
        log::info!("Saved window frame {frame:?} is off screen; keeping the default");
        return Ok(());
    }
    window.set_size(LogicalSize::new(frame.width, frame.height))?;
    window.set_position(LogicalPosition::new(frame.x, frame.y))?;
    Ok(())
}

/// Apply the Session's window frame to the main window, if both exist.
pub fn apply_saved_frame<R: Runtime>(app: &AppHandle<R>) {
    let Some(frame) = app.state::<SessionState>().window() else {
        return;
    };
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    if let Err(error) = restore_window_frame(&window, frame) {
        log::warn!("Could not restore the window frame: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(x: i32, y: i32, width: u32, height: u32) -> WindowFrame {
        WindowFrame {
            x,
            y,
            width,
            height,
        }
    }

    fn renderer_session() -> Value {
        json!({
            "version": 1,
            "folder": null,
            "openEditors": [{ "path": "/Users/x/notes/a.md", "mode": "rich" }],
            "activePath": "/Users/x/notes/a.md",
            "sidebar": { "collapsed": false, "width": 260 },
        })
    }

    #[test]
    fn merge_window_adds_the_frame_to_the_renderer_session() {
        let merged = merge_window(Some(&renderer_session()), Some(frame(10, 20, 1200, 800)));

        assert_eq!(merged["openEditors"][0]["path"], "/Users/x/notes/a.md");
        assert_eq!(
            merged["window"],
            json!({ "x": 10, "y": 20, "width": 1200, "height": 800 })
        );
    }

    #[test]
    fn merge_window_replaces_a_stale_frame_and_keeps_an_unknown_one() {
        let mut stale = renderer_session();
        stale["window"] = json!({ "x": 1, "y": 1, "width": 1, "height": 1 });

        let replaced = merge_window(Some(&stale), Some(frame(10, 20, 1200, 800)));
        assert_eq!(replaced["window"]["width"], 1200);

        let kept = merge_window(Some(&stale), None);
        assert_eq!(kept["window"]["width"], 1);
    }

    #[test]
    fn merge_window_starts_from_the_schema_defaults_without_a_renderer_session() {
        let merged = merge_window(None, Some(frame(0, 0, 1200, 800)));

        assert_eq!(
            merged,
            json!({
                "version": 1,
                "folder": null,
                "openEditors": [],
                "activePath": null,
                "sidebar": { "collapsed": false, "width": 260 },
                "pinned": {},
                "window": { "x": 0, "y": 0, "width": 1200, "height": 800 },
            })
        );
    }

    #[test]
    fn frame_from_session_needs_the_current_version_and_a_whole_frame() {
        let mut session = renderer_session();
        session["window"] = json!({ "x": 5, "y": 6, "width": 700, "height": 500 });
        assert_eq!(frame_from_session(&session), Some(frame(5, 6, 700, 500)));

        session["version"] = json!(2);
        assert_eq!(frame_from_session(&session), None);

        session["version"] = json!(1);
        session["window"] = json!({ "x": 5, "y": 6 });
        assert_eq!(frame_from_session(&session), None);
        assert_eq!(frame_from_session(&renderer_session()), None);
    }

    #[test]
    fn write_atomically_round_trips_creates_the_directory_and_leaves_no_temp_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("nested").join(SESSION_FILE_NAME);
        let session = merge_window(Some(&renderer_session()), Some(frame(1, 2, 3, 4)));

        write_atomically(&path, &session).unwrap();

        assert_eq!(read_session_file(&path), Some(session));
        let leftovers: Vec<_> = fs::read_dir(path.parent().unwrap())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(leftovers, [SESSION_FILE_NAME]);
    }

    #[test]
    fn read_session_file_ignores_a_missing_or_unreadable_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(SESSION_FILE_NAME);

        assert_eq!(read_session_file(&path), None);

        fs::write(&path, "{ not json").unwrap();
        assert_eq!(read_session_file(&path), None);
    }

    #[test]
    fn session_state_seeds_from_the_file_and_flushes_the_merged_session() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(SESSION_FILE_NAME);
        let mut stored = renderer_session();
        stored["window"] = json!({ "x": 7, "y": 8, "width": 900, "height": 600 });
        write_atomically(&path, &stored).unwrap();

        let state = SessionState::load(path.clone());
        assert_eq!(state.window(), Some(frame(7, 8, 900, 600)));
        // A window move before the renderer reports keeps the stored Tabs.
        let generation = state.update_window(frame(9, 9, 900, 600));
        assert!(state.is_current(generation));
        state.flush().unwrap();

        let written = read_session_file(&path).unwrap();
        assert_eq!(written["openEditors"][0]["path"], "/Users/x/notes/a.md");
        assert_eq!(written["window"]["x"], 9);

        // The renderer's update replaces its part and supersedes older generations.
        let next =
            state.update_renderer(json!({ "version": 1, "openEditors": [], "activePath": null }));
        assert!(!state.is_current(generation));
        assert!(state.is_current(next));
        state.flush().unwrap();
        let written = read_session_file(&path).unwrap();
        assert_eq!(written["openEditors"], json!([]));
        assert_eq!(written["window"]["x"], 9);
    }

    #[test]
    fn session_state_does_not_carry_an_unknown_version_forward() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(SESSION_FILE_NAME);
        write_atomically(
            &path,
            &json!({ "version": 99, "openEditors": [{ "path": "/x.md" }], "window": { "x": 1, "y": 1, "width": 700, "height": 500 } }),
        )
        .unwrap();

        let state = SessionState::load(path);

        assert_eq!(state.window(), None);
        assert_eq!(state.merged()["version"], 1);
        assert_eq!(state.merged()["openEditors"], json!([]));
    }

    #[test]
    fn session_state_starts_empty_without_a_file() {
        let directory = tempfile::tempdir().unwrap();
        let state = SessionState::load(directory.path().join(SESSION_FILE_NAME));

        assert_eq!(state.window(), None);
        assert_eq!(state.merged()["openEditors"], json!([]));
    }

    fn session_with_pins() -> Value {
        let mut session = renderer_session();
        session["folder"] = json!("/Users/x/notes");
        session["sidebar"]["collapsedSections"] = json!(["pinned"]);
        session["pinned"] = json!({
            "/Users/x/notes": [
                "/Users/x/notes/c.md",
                "/Users/x/notes/a.md",
                "/Users/x/notes/images/lake.png",
            ],
            "/Users/x/work": ["/Users/x/work/plan.md"],
        });
        session
    }

    #[test]
    fn each_folders_pinned_list_survives_a_relaunch_in_order() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(SESSION_FILE_NAME);
        let state = SessionState::load(path.clone());
        state.update_renderer(session_with_pins());
        state.update_window(frame(1, 2, 1200, 800));
        state.flush().unwrap();

        // A relaunch seeds from the file; a window move before the renderer
        // reports writes the pins back untouched.
        let relaunched = SessionState::load(path.clone());
        relaunched.update_window(frame(3, 4, 1200, 800));
        relaunched.flush().unwrap();

        let written = read_session_file(&path).unwrap();
        assert_eq!(written["pinned"], session_with_pins()["pinned"]);
        assert_eq!(
            written["pinned"]["/Users/x/notes"],
            json!([
                "/Users/x/notes/c.md",
                "/Users/x/notes/a.md",
                "/Users/x/notes/images/lake.png",
            ])
        );
        assert_eq!(written["sidebar"]["collapsedSections"], json!(["pinned"]));
        assert_eq!(written["window"]["x"], 3);
    }

    #[test]
    fn a_folder_change_keeps_the_other_folders_pins() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(SESSION_FILE_NAME);
        let state = SessionState::load(path.clone());
        state.update_renderer(session_with_pins());

        // The renderer switches to the other Folder and hands over its whole
        // part again: both lists ride along, only `folder` changes.
        let mut switched = session_with_pins();
        switched["folder"] = json!("/Users/x/work");
        state.update_renderer(switched);
        state.flush().unwrap();

        let written = read_session_file(&path).unwrap();
        assert_eq!(written["folder"], "/Users/x/work");
        assert_eq!(written["pinned"], session_with_pins()["pinned"]);
    }

    #[test]
    fn frame_is_on_screen_needs_a_visible_corner() {
        let screens = [frame(0, 0, 1440, 900)];

        assert!(frame_is_on_screen(&frame(100, 100, 1200, 800), &screens));
        assert!(frame_is_on_screen(&frame(1370, 860, 1200, 800), &screens));
        assert!(!frame_is_on_screen(&frame(1400, 880, 1200, 800), &screens));
        assert!(!frame_is_on_screen(&frame(-1200, 0, 1200, 800), &screens));
        assert!(!frame_is_on_screen(&frame(0, 0, 1200, 800), &[]));
    }
}
