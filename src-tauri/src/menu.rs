//! The menu bar. A click goes to the focused window as a `menu` event with
//! the id of the item, and the frontend acts on it.
//!
//! There is no Undo or Redo item. The rendered page owns its edit log and
//! takes the undo chord itself. A native Undo item would take the key first
//! and send it to the text field of the web view.

use tauri::menu::{
    AboutMetadata, CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
    WINDOW_SUBMENU_ID,
};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_opener::OpenerExt;

const WEBSITE: &str = "https://opendocument.app";
const ISSUES: &str = "https://github.com/opendocument-app/OpenDocument.desktop/issues";

struct Checks {
    darken: CheckMenuItem<Wry>,
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let item = |id: &str, text: &str, accelerator: Option<&str>| {
        MenuItem::with_id(app, id, text, true, accelerator)
    };
    let separator = || PredefinedMenuItem::separator(app);

    let new = Submenu::with_items(
        app,
        "New",
        true,
        &[
            &item("new-odt", "Text Document (ODT)", None)?,
            &item("new-ods", "Spreadsheet (ODS)", None)?,
            &item("new-docx", "Word Document (DOCX)", None)?,
            &item("new-xlsx", "Excel Spreadsheet (XLSX)", None)?,
        ],
    )?;

    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item("new-window", "New Window", Some("CmdOrCtrl+N"))?,
            &new,
            &item("open", "Open…", Some("CmdOrCtrl+O"))?,
            &separator()?,
            &item("save", "Save", Some("CmdOrCtrl+S"))?,
            &item("save-as", "Save As…", Some("CmdOrCtrl+Shift+S"))?,
            &separator()?,
            &item("print", "Print…", Some("CmdOrCtrl+P"))?,
            &separator()?,
            &item(
                "close-document",
                "Close Document",
                Some("CmdOrCtrl+Shift+W"),
            )?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &separator()?,
            &item("find", "Find…", Some("CmdOrCtrl+F"))?,
            &item("find-next", "Find Next", Some("CmdOrCtrl+G"))?,
            &item("find-previous", "Find Previous", Some("CmdOrCtrl+Shift+G"))?,
            &separator()?,
            &item("edit-mode", "Edit Document", Some("CmdOrCtrl+E"))?,
        ],
    )?;

    let darken =
        CheckMenuItem::with_id(app, "darken", "Darken Documents", true, true, None::<&str>)?;
    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &item("zoom-in", "Zoom In", Some("CmdOrCtrl+="))?,
            &item("zoom-out", "Zoom Out", Some("CmdOrCtrl+-"))?,
            &item("zoom-fit", "Fit to Window", Some("CmdOrCtrl+0"))?,
            &separator()?,
            &darken,
            &separator()?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let window = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ],
    )?;

    let help = Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        "Help",
        true,
        &[
            &item("website", "OpenDocument Reader Website", None)?,
            &item("report", "Report a Problem", None)?,
        ],
    )?;

    // Not the predefined Quit, which ends the app at once. This one closes the
    // windows one by one, so each window asks about its unsaved changes.
    let quit = item("quit", "Quit OpenDocument Reader", Some("CmdOrCtrl+Q"))?;

    let menu = Menu::new(app)?;

    #[cfg(target_os = "macos")]
    {
        let about = AboutMetadata {
            website: Some(WEBSITE.into()),
            ..Default::default()
        };
        let app_menu = Submenu::with_items(
            app,
            "OpenDocument Reader",
            true,
            &[
                &PredefinedMenuItem::about(app, None, Some(about))?,
                &separator()?,
                &PredefinedMenuItem::services(app, None)?,
                &separator()?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &separator()?,
                &quit,
            ],
        )?;
        menu.append(&app_menu)?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = AboutMetadata::default();
        file.append(&separator()?)?;
        file.append(&quit)?;
    }

    menu.append_items(&[&file, &edit, &view, &window, &help])?;
    app.set_menu(menu)?;
    app.manage(Checks { darken });

    app.on_menu_event(|app, event| {
        let id = event.id().as_ref();
        match id {
            "website" => {
                let _ = app.opener().open_url(WEBSITE, None::<&str>);
            }
            "report" => {
                let _ = app.opener().open_url(ISSUES, None::<&str>);
            }
            "quit" => crate::close_all_windows(app),
            _ => {
                let target = app
                    .webview_windows()
                    .into_values()
                    .filter(|w| !w.label().starts_with(crate::PRINT_PREFIX))
                    .find(|w| w.is_focused().unwrap_or(false));
                match target {
                    Some(w) => {
                        let _ = app.emit_to(w.label(), "menu", id);
                    }
                    // Only New Window and Open make sense with no window.
                    None if id == "new-window" || id == "open" => {
                        let _ = crate::new_document_window(app, Vec::new());
                    }
                    None => {}
                }
            }
        }
    });
    Ok(())
}

pub fn set_check(app: &AppHandle, id: &str, checked: bool) -> Result<(), String> {
    let checks = app.state::<Checks>();
    match id {
        "darken" => checks
            .darken
            .set_checked(checked)
            .map_err(|e| e.to_string()),
        _ => Err(format!("no check item {id}")),
    }
}
