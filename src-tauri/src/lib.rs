//! The shell around the frontend: windows, menus, file access and printing.
//!
//! The frontend runs the core and owns the document. This side reads and
//! writes the files, routes the files that the operating system opens to a
//! window, and shows the print window.

mod menu;

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// The prefix of the windows that only print. They get no file access.
const PRINT_PREFIX: &str = "print-";

#[derive(Default)]
struct Shared {
    /// The files that wait for a window, by window label.
    pending: HashMap<String, Vec<String>>,
    /// The windows whose frontend asked for its files, so it hears events.
    ready: HashSet<String>,
    /// The markup that a print window shows, by window label.
    print: HashMap<String, PrintJob>,
}

#[derive(Clone, serde::Serialize)]
struct PrintJob {
    title: String,
    html: String,
}

struct State {
    shared: Mutex<Shared>,
    next_window: AtomicU32,
}

fn refuse_print_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label().starts_with(PRINT_PREFIX) {
        return Err("a print window cannot do this".into());
    }
    Ok(())
}

/// The bytes of a file, as an `ArrayBuffer` on the frontend.
#[tauri::command]
fn read_file(window: WebviewWindow, path: String) -> Result<Response, String> {
    refuse_print_window(&window)?;
    fs::read(&path)
        .map(Response::new)
        .map_err(|e| e.to_string())
}

/// Writes the raw body of the request to the path in the `x-path` header.
#[tauri::command]
fn write_file(window: WebviewWindow, request: Request<'_>) -> Result<(), String> {
    refuse_print_window(&window)?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("the body must be raw bytes".into());
    };
    let header = request
        .headers()
        .get("x-path")
        .ok_or("no x-path header")?
        .to_str()
        .map_err(|e| e.to_string())?;
    let path = percent_decode_str(header)
        .decode_utf8()
        .map_err(|e| e.to_string())?;
    write_atomically(Path::new(path.as_ref()), bytes).map_err(|e| e.to_string())
}

/// Writes into a temporary file beside the target, then renames it over the
/// target. So a failed write never leaves half a document.
fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let temp = dir.join(format!(".{name}.{}.saving", std::process::id()));

    let result = (|| {
        let mut file = fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        if let Ok(meta) = fs::metadata(path) {
            fs::set_permissions(&temp, meta.permissions())?;
        }
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

/// The files that wait for the calling window. After this call, the window
/// gets later files as `open-paths` events.
#[tauri::command]
fn take_launch(window: WebviewWindow, state: tauri::State<'_, State>) -> Vec<String> {
    let mut shared = state.shared.lock().unwrap();
    shared.ready.insert(window.label().to_string());
    shared.pending.remove(window.label()).unwrap_or_default()
}

/// Opens one new window for each path, or one empty window for no path.
#[tauri::command]
fn open_window(app: AppHandle, window: WebviewWindow, paths: Vec<String>) -> Result<(), String> {
    refuse_print_window(&window)?;
    if paths.is_empty() {
        return new_document_window(&app, Vec::new()).map(|_| ());
    }
    for path in paths {
        new_document_window(&app, vec![path])?;
    }
    Ok(())
}

fn new_document_window(app: &AppHandle, paths: Vec<String>) -> Result<WebviewWindow, String> {
    let state = app.state::<State>();
    let label = format!("doc-{}", state.next_window.fetch_add(1, Ordering::Relaxed));
    if !paths.is_empty() {
        state
            .shared
            .lock()
            .unwrap()
            .pending
            .insert(label.clone(), paths);
    }
    WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("OpenDocument Reader")
        .inner_size(1100.0, 800.0)
        .min_inner_size(480.0, 360.0)
        .build()
        .map_err(|e| e.to_string())
}

/// Opens a print window for the markup. That window prints itself.
#[tauri::command]
fn start_print(
    app: AppHandle,
    window: WebviewWindow,
    title: String,
    html: String,
) -> Result<(), String> {
    refuse_print_window(&window)?;
    let state = app.state::<State>();
    let label = format!(
        "{PRINT_PREFIX}{}",
        state.next_window.fetch_add(1, Ordering::Relaxed)
    );
    state.shared.lock().unwrap().print.insert(
        label.clone(),
        PrintJob {
            title: title.clone(),
            html,
        },
    );
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("print.html".into()))
        .title(format!("Print — {title}"))
        .inner_size(900.0, 1000.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// The markup of the calling print window, once.
#[tauri::command]
fn take_print(window: WebviewWindow, state: tauri::State<'_, State>) -> Option<PrintJob> {
    state.shared.lock().unwrap().print.remove(window.label())
}

/// Sets the check mark of a check item in the menu.
#[tauri::command]
fn set_menu_check(app: AppHandle, id: String, checked: bool) -> Result<(), String> {
    menu::set_check(&app, &id, checked)
}

/// What the smoke mode does: `ODR_DESKTOP_SMOKE` names a file to open, and
/// `ODR_DESKTOP_SMOKE_SAVE` names a path to save a copy to, and
/// `ODR_DESKTOP_SMOKE_PASSWORD` is the password of an encrypted file. The frontend
/// reports, and the app exits. CI uses this to check a build.
#[derive(serde::Serialize)]
struct Smoke {
    path: String,
    save_to: Option<String>,
    password: Option<String>,
}

#[tauri::command]
fn smoke_path(window: WebviewWindow) -> Option<Smoke> {
    if window.label() != "main" {
        return None;
    }
    let path = std::env::var("ODR_DESKTOP_SMOKE")
        .ok()
        .filter(|p| !p.is_empty())?;
    let save_to = std::env::var("ODR_DESKTOP_SMOKE_SAVE")
        .ok()
        .filter(|p| !p.is_empty());
    let password = std::env::var("ODR_DESKTOP_SMOKE_PASSWORD").ok();
    Some(Smoke {
        path,
        save_to,
        password,
    })
}

#[tauri::command]
fn smoke_report(app: AppHandle, ok: bool, detail: String) {
    println!("smoke: {} {detail}", if ok { "ok" } else { "FAILED" });
    app.exit(if ok { 0 } else { 1 });
}

/// Sends files to a window that can take them. A window that is not ready
/// keeps them until its frontend asks. With no window, a new one opens.
fn route_paths(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    let windows: Vec<WebviewWindow> = app
        .webview_windows()
        .into_values()
        .filter(|w| !w.label().starts_with(PRINT_PREFIX))
        .collect();
    let state = app.state::<State>();
    let mut shared = state.shared.lock().unwrap();

    let ready: Vec<&WebviewWindow> = windows
        .iter()
        .filter(|w| shared.ready.contains(w.label()))
        .collect();
    let target = ready
        .iter()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| ready.first())
        .map(|w| w.label().to_string());

    if let Some(label) = target {
        drop(shared);
        let _ = app.emit_to(&label, "open-paths", paths);
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.set_focus();
        }
    } else if let Some(w) = windows.first() {
        shared
            .pending
            .entry(w.label().to_string())
            .or_default()
            .extend(paths);
    } else {
        drop(shared);
        let _ = new_document_window(app, paths);
    }
}

/// Asks every window to close. A window with unsaved changes asks the user,
/// and the app exits when the last window is gone.
fn close_all_windows(app: &AppHandle) {
    for window in app.webview_windows().into_values() {
        let _ = window.close();
    }
}

/// The paths among the arguments of a launch. A relative path is relative to
/// the directory that the launch came from.
fn paths_from_args(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(a);
            if p.is_absolute() {
                p
            } else {
                cwd.join(p)
            }
        })
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // A second launch on Windows and Linux hands its files to this one. On
    // macOS the system does that, with `RunEvent::Opened`.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let paths = paths_from_args(&args, Path::new(&cwd));
            if paths.is_empty() {
                if let Some(w) = app.webview_windows().into_values().next() {
                    let _ = w.set_focus();
                }
            } else {
                route_paths(app, paths);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_filter(|label| label == "main")
                .build(),
        )
        .manage(State {
            shared: Mutex::default(),
            next_window: AtomicU32::new(1),
        })
        .setup(|app| {
            let cwd = std::env::current_dir().unwrap_or_default();
            let args: Vec<String> = std::env::args().collect();
            let paths = paths_from_args(&args, &cwd);
            if !paths.is_empty() {
                app.state::<State>()
                    .shared
                    .lock()
                    .unwrap()
                    .pending
                    .insert("main".into(), paths);
            }
            menu::install(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<State>();
                let mut shared = state.shared.lock().unwrap();
                shared.ready.remove(window.label());
                shared.pending.remove(window.label());
                shared.print.remove(window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            take_launch,
            open_window,
            start_print,
            take_print,
            set_menu_check,
            smoke_path,
            smoke_report,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the application")
        .run(|_app, _event| {
            // A quit from outside the menu, such as the Dock on macOS, closes
            // the windows first, so each window asks about unsaved changes.
            // With no window left, the app exits.
            if let tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } = &_event
            {
                if !_app.webview_windows().is_empty() {
                    api.prevent_exit();
                    close_all_windows(_app);
                }
            }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &_event {
                let paths = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                route_paths(_app, paths);
            }
        });
}
