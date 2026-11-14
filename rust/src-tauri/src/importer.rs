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
    let electron_dir = get_electron_data_dir()?;
    if !electron_dir.exists() {
        return None;
    }

    info!("Found existing Electron user data directory at: {:?}", electron_dir);

    let state_file = electron_dir.join("storage").join("state.json");
    let settings_file = electron_dir.join("storage").join("settings.json");

    let mut spaces = None;
    let mut tabs = None;
    let mut active_space_id = None;
    let mut settings = None;

    if state_file.exists() {
        if let Ok(content) = fs::read_to_string(&state_file) {
            // Backup before import
            let backup_file = electron_dir.join("storage").join("state.json.bak");
            let _ = fs::write(backup_file, &content);

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(spaces_arr) = val.get("spaces") {
                    if let Ok(sp) = serde_json::from_value::<Vec<Space>>(spaces_arr.clone()) {
                        if !sp.is_empty() {
                            spaces = Some(sp);
                        }
                    }
                }
                if let Some(active_id) = val.get("activeSpaceId").and_then(|v| v.as_str()) {
                    active_space_id = Some(active_id.to_string());
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
                }
            }
        }
    }

    if settings.is_none() && settings_file.exists() {
        if let Ok(content) = fs::read_to_string(&settings_file) {
            if let Ok(s) = serde_json::from_str::<BrowserSettings>(&content) {
                settings = Some(s);
            }
        }
    }

    if spaces.is_some() || settings.is_some() || tabs.is_some() {
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

fn get_electron_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return Some(Path::new(&appdata).join("neutrino"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Some(Path::new(&home).join("Library").join("Application Support").join("neutrino"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(config) = std::env::var("XDG_CONFIG_HOME") {
            return Some(Path::new(&config).join("neutrino"));
        } else if let Ok(home) = std::env::var("HOME") {
            return Some(Path::new(&home).join(".config").join("neutrino"));
        }
    }
    None
}

