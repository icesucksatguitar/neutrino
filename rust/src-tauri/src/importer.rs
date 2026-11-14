use crate::settings::BrowserSettings;
use crate::spaces::Space;
use crate::tabs::TabState;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;

pub struct ImportedData {
    pub spaces: Option<Vec<Space>>,
    pub tabs: Option<Vec<TabState>>,
    pub active_space_id: Option<String>,
    pub settings: Option<BrowserSettings>,
}

pub fn try_import_electron_data() -> Option<ImportedData> {
    let candidate_dirs = get_electron_data_dirs();
    for dir in candidate_dirs {
        if let Some(imported) = try_import_from_dir(&dir) {
            return Some(imported);
        }
    }
    None
}

fn try_import_from_dir(electron_dir: &Path) -> Option<ImportedData> {
    if !electron_dir.exists() {
        return None;
    }

    info!("Checking Electron user data directory at: {:?}", electron_dir);

    // Check neutrino-data/browser-state.json first (primary Electron storage)
    let primary_state = electron_dir.join("neutrino-data").join("browser-state.json");
    let fallback_state = electron_dir.join("storage").join("state.json");
    let state_file = if primary_state.exists() {
        primary_state
    } else if fallback_state.exists() {
        fallback_state
    } else {
        return None;
    };

    let content = fs::read_to_string(&state_file).ok()?;
    
    // Backup before importing as requested in Phase 3.1
    let backup_file = state_file.with_extension("backup-pre-tauri.json");
    if !backup_file.exists() {
        let _ = fs::write(&backup_file, &content);
        info!("Created backup of Electron state at: {:?}", backup_file);
    }

    let val = serde_json::from_str::<serde_json::Value>(&content).ok()?;

    let mut spaces = None;
    let mut tabs = None;
    let mut active_space_id = None;
    let mut settings = None;

    if let Some(spaces_arr) = val.get("spaces") {
        if let Ok(sp) = serde_json::from_value::<Vec<Space>>(spaces_arr.clone()) {
            if !sp.is_empty() {
                spaces = Some(sp);
            }
        }
    }

    if let Some(tabs_arr) = val.get("tabs") {
        if let Ok(t) = serde_json::from_value::<Vec<TabState>>(tabs_arr.clone()) {
            tabs = Some(t);
        }
    }

    if let Some(settings_val) = val.get("settings") {
        if let Ok(s) = serde_json::from_value::<BrowserSettings>(settings_val.clone()) {
            settings = Some(s);
        }
        if let Some(active_id) = settings_val.get("activeSpaceId").and_then(|v| v.as_str()) {
            active_space_id = Some(active_id.to_string());
        }
    }

    if active_space_id.is_none() {
        if let Some(active_id) = val.get("activeSpaceId").and_then(|v| v.as_str()) {
            active_space_id = Some(active_id.to_string());
        }
    }

    if spaces.is_some() || settings.is_some() || tabs.is_some() {
        info!("Successfully imported Electron data from {:?}", state_file);
        Some(ImportedData {
            spaces,
            tabs,
            active_space_id,
            settings,
        })
    } else {
        None
    }
}

fn get_electron_data_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let base = Path::new(&appdata);
            dirs.push(base.join("neutrino-browser"));
            dirs.push(base.join("neutrino"));
            dirs.push(base.join("Neutrino"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let base = Path::new(&home).join("Library").join("Application Support");
            dirs.push(base.join("neutrino-browser"));
            dirs.push(base.join("neutrino"));
            dirs.push(base.join("Neutrino"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(config) = std::env::var("XDG_CONFIG_HOME") {
            let base = Path::new(&config);
            dirs.push(base.join("neutrino-browser"));
            dirs.push(base.join("neutrino"));
        } else if let Ok(home) = std::env::var("HOME") {
            let base = Path::new(&home).join(".config");
            dirs.push(base.join("neutrino-browser"));
            dirs.push(base.join("neutrino"));
        }
    }
    dirs
}
