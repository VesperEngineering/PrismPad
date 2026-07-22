mod files;
mod watch;

use serde::Deserialize;
use std::{collections::HashMap, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager, State,
};

const STABLE_COMMAND_IDS: [&str; 12] = [
    "file.new",
    "file.open",
    "file.save",
    "file.saveAs",
    "file.close",
    "edit.find",
    "edit.replace",
    "view.wrap",
    "view.markdownPreview",
    "view.zoomIn",
    "view.zoomOut",
    "view.theme",
];

fn is_stable_command_id(id: &str) -> bool {
    STABLE_COMMAND_IDS.contains(&id)
}

struct MenuAvailabilityState {
    items: Mutex<HashMap<String, MenuItem<tauri::Wry>>>,
}

#[derive(Deserialize)]
struct MenuAvailabilityUpdate {
    id: String,
    enabled: bool,
}

#[tauri::command]
fn update_menu_availability(
    state: State<'_, MenuAvailabilityState>,
    updates: Vec<MenuAvailabilityUpdate>,
) -> Result<(), String> {
    let items = state
        .items
        .lock()
        .map_err(|_| "menu availability lock failed")?;
    for update in &updates {
        if !is_stable_command_id(&update.id) {
            return Err("unknown menu command".into());
        }
        if !items.contains_key(&update.id) {
            return Err("menu command unavailable".into());
        }
    }
    for update in &updates {
        items
            .get(&update.id)
            .expect("validated menu item")
            .set_enabled(update.enabled)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod watch_tests {
    use notify::event::{DataChange, ModifyKind, RemoveKind, RenameMode};
    use notify::EventKind;

    use crate::watch::{debounce_delay, is_relevant_event, require_canonical_path, watch_root};

    #[test]
    fn accepts_only_already_canonical_paths() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let file = temporary.path().join("note.txt");
        std::fs::write(&file, "note").expect("write test file");
        let canonical = std::fs::canonicalize(&file).expect("canonical file path");

        assert_eq!(
            require_canonical_path(&canonical).expect("canonical path"),
            canonical
        );
        let parent = canonical.parent().expect("file parent");
        let detour = parent.join("detour");
        std::fs::create_dir(&detour).expect("create detour directory");
        let noncanonical = detour
            .join("..")
            .join(canonical.file_name().expect("file name"));
        assert!(require_canonical_path(&noncanonical).is_err());
    }

    #[test]
    fn filters_to_content_rename_and_removal_events() {
        assert!(is_relevant_event(&EventKind::Modify(ModifyKind::Data(
            DataChange::Content
        ))));
        assert!(is_relevant_event(&EventKind::Modify(ModifyKind::Name(
            RenameMode::Any
        ))));
        assert!(is_relevant_event(&EventKind::Remove(RemoveKind::File)));
        assert!(!is_relevant_event(&EventKind::Access(
            notify::event::AccessKind::Any
        )));
    }

    #[test]
    fn watches_a_canonical_file_parent_so_atomic_replacements_remain_observable() {
        assert_eq!(
            watch_root(std::path::Path::new("/tmp/note.txt")),
            std::path::PathBuf::from("/tmp")
        );
    }

    #[test]
    fn uses_the_required_quarter_second_debounce_window() {
        assert_eq!(debounce_delay(), std::time::Duration::from_millis(250));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let new_document =
                MenuItem::with_id(app, "file.new", "New", true, Some("CmdOrCtrl+N"))?;
            let open = MenuItem::with_id(app, "file.open", "Open…", true, Some("CmdOrCtrl+O"))?;
            let save = MenuItem::with_id(app, "file.save", "Save", true, Some("CmdOrCtrl+S"))?;
            let save_as = MenuItem::with_id(
                app,
                "file.saveAs",
                "Save As…",
                true,
                Some("CmdOrCtrl+Shift+S"),
            )?;
            let close = MenuItem::with_id(app, "file.close", "Close", true, Some("CmdOrCtrl+W"))?;
            let separator = PredefinedMenuItem::separator(app)?;
            let file = Submenu::with_items(
                app,
                "File",
                true,
                &[&new_document, &open, &separator, &save, &save_as, &close],
            )?;

            let find = MenuItem::with_id(app, "edit.find", "Find", true, Some("CmdOrCtrl+F"))?;
            let replace =
                MenuItem::with_id(app, "edit.replace", "Replace", true, Some("CmdOrCtrl+H"))?;
            let edit = Submenu::with_items(app, "Edit", true, &[&find, &replace])?;

            let wrap = MenuItem::with_id(app, "view.wrap", "Word Wrap", true, Some("Alt+Z"))?;
            let preview = MenuItem::with_id(
                app,
                "view.markdownPreview",
                "Markdown Preview",
                true,
                Some("CmdOrCtrl+Shift+M"),
            )?;
            let zoom_in =
                MenuItem::with_id(app, "view.zoomIn", "Zoom In", true, Some("CmdOrCtrl+="))?;
            let zoom_out =
                MenuItem::with_id(app, "view.zoomOut", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
            let theme = MenuItem::with_id(
                app,
                "view.theme",
                "Cycle Theme",
                true,
                Some("CmdOrCtrl+Shift+T"),
            )?;
            let view_separator = PredefinedMenuItem::separator(app)?;
            let view = Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &wrap,
                    &preview,
                    &view_separator,
                    &zoom_in,
                    &zoom_out,
                    &theme,
                ],
            )?;

            let help_item =
                MenuItem::with_id(app, "help.about", "About PrismPad", true, None::<&str>)?;
            let help = Submenu::with_items(app, "Help", true, &[&help_item])?;
            let mut availability = HashMap::new();
            for (id, item) in [
                ("file.new", &new_document),
                ("file.open", &open),
                ("file.save", &save),
                ("file.saveAs", &save_as),
                ("file.close", &close),
                ("edit.find", &find),
                ("edit.replace", &replace),
                ("view.wrap", &wrap),
                ("view.markdownPreview", &preview),
                ("view.zoomIn", &zoom_in),
                ("view.zoomOut", &zoom_out),
                ("view.theme", &theme),
            ] {
                availability.insert(id.to_owned(), item.clone());
            }
            for id in [
                "file.save",
                "file.saveAs",
                "file.close",
                "edit.find",
                "edit.replace",
                "view.markdownPreview",
            ] {
                availability
                    .get(id)
                    .expect("stable menu item")
                    .set_enabled(false)?;
            }
            app.manage(MenuAvailabilityState {
                items: Mutex::new(availability),
            });
            let menu = Menu::with_items(app, &[&file, &edit, &view, &help])?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if is_stable_command_id(id) {
                let _ = app.emit("prismpad://command", id);
            }
        })
        .manage(watch::WatchState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            files::read_text_file,
            files::write_text_file,
            watch::watch_path,
            watch::unwatch_path,
            update_menu_availability
        ])
        .run(tauri::generate_context!())
        .expect("PrismPad failed to start");
}

#[cfg(test)]
mod menu_tests {
    use super::{is_stable_command_id, STABLE_COMMAND_IDS};

    #[test]
    fn accepts_only_the_frontend_stable_command_contract() {
        assert_eq!(STABLE_COMMAND_IDS.len(), 12);
        assert!(is_stable_command_id("file.saveAs"));
        assert!(is_stable_command_id("view.markdownPreview"));
        assert!(!is_stable_command_id("view.workspace"));
        assert!(!is_stable_command_id("help.about"));
    }
}
