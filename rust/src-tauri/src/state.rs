use crate::history::HistoryEntry;
use crate::importer::try_import_electron_data;
use crate::settings::BrowserSettings;
use crate::shields::{ShieldEngine, ShieldStats};
use crate::spaces::{default_spaces, Space};
use crate::tabs::TabState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceStats {
    pub memory_saved_mb: f64,
    pub sleeping_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAppState {
    pub spaces: Vec<Space>,
    pub active_space_id: String,
    pub tabs: Vec<TabState>,
    pub active_tab_id: Option<String>,
    pub shield_stats: ShieldStats,
    pub resource_stats: ResourceStats,
}

pub struct InnerState {
    pub spaces: Vec<Space>,
    pub active_space_id: String,
    pub tabs: Vec<TabState>,
    pub active_tab_id: Option<String>,
    pub settings: BrowserSettings,
    pub shield_stats: ShieldStats,
    pub shield_engine: ShieldEngine,
    pub history: Vec<HistoryEntry>,
    pub data_dir: PathBuf,
}

#[derive(Clone)]
pub struct AppState(pub Arc<RwLock<InnerState>>);

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&data_dir);
        let settings_path = data_dir.join("settings.json");
        let state_path = data_dir.join("state.json");

        let mut settings = BrowserSettings::default();
        let mut spaces = default_spaces();
        let mut active_space_id = "space-study".to_string();
        let mut tabs = Vec::new();
        let mut active_tab_id = None;

        // Check if existing state exists in data_dir
        let mut loaded_existing = false;
        if settings_path.exists() {
            if let Ok(content) = fs::read_to_string(&settings_path) {
                if let Ok(s) = serde_json::from_str::<BrowserSettings>(&content) {
                    settings = s;
                    loaded_existing = true;
                }
            }
        }

        if state_path.exists() {
            if let Ok(content) = fs::read_to_string(&state_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(sp) = val.get("spaces").and_then(|v| serde_json::from_value::<Vec<Space>>(v.clone()).ok()) {
                        if !sp.is_empty() {
                            spaces = sp;
                            loaded_existing = true;
                        }
                    }
                    if let Some(act) = val.get("activeSpaceId").and_then(|v| v.as_str()) {
                        active_space_id = act.to_string();
                    }
                    if let Some(t) = val.get("tabs").and_then(|v| serde_json::from_value::<Vec<TabState>>(v.clone()).ok()) {
                        tabs = t;
                    }
                    if let Some(at) = val.get("activeTabId").and_then(|v| v.as_str()) {
                        active_tab_id = Some(at.to_string());
                    }
                }
            }
        }

        // If no existing local state, attempt silent import from Electron!
        if !loaded_existing {
            if let Some(imported) = try_import_electron_data() {
                info!("Imported existing Electron profile data into Tauri!");
                if let Some(sp) = imported.spaces {
                    spaces = sp;
                }
                if let Some(act) = imported.active_space_id {
                    active_space_id = act;
                }
                if let Some(t) = imported.tabs {
                    tabs = t;
                }
                if let Some(s) = imported.settings {
                    settings = s;
                }
            }
        }

        // Ensure active space exists
        if !spaces.iter().any(|s| s.id == active_space_id) {
            active_space_id = spaces.first().map(|s| s.id.clone()).unwrap_or_else(|| "space-study".to_string());
        }

        // Ensure at least one tab in active space
        let active_space_tabs: Vec<_> = tabs.iter().filter(|t| t.space_id == active_space_id).collect();
        if active_space_tabs.is_empty() {
            let initial_tab = TabState::new("tab-initial".to_string(), active_space_id.clone(), Some("neutrino://newtab".to_string()));
            active_tab_id = Some(initial_tab.id.clone());
            tabs.push(initial_tab);
        } else if active_tab_id.is_none() || !tabs.iter().any(|t| t.id == active_tab_id.as_deref().unwrap_or("")) {
            active_tab_id = Some(active_space_tabs[0].id.clone());
        }

        let mut shield_engine = ShieldEngine::default();
        shield_engine.set_enabled(settings.adblock_enabled);
        shield_engine.set_whitelist(settings.shield_whitelist.clone());

        let inner = InnerState {
            spaces,
            active_space_id,
            tabs,
            active_tab_id,
            settings,
            shield_stats: ShieldStats::default(),
            shield_engine,
            history: Vec::new(),
            data_dir,
        };

        // Persist initial or imported state so files exist immediately on disk
        let state_val = serde_json::json!({
            "spaces": inner.spaces,
            "activeSpaceId": inner.active_space_id,
            "tabs": inner.tabs,
            "activeTabId": inner.active_tab_id,
        });
        if let Ok(state_json) = serde_json::to_string_pretty(&state_val) {
            let _ = fs::write(inner.data_dir.join("state.json"), state_json);
        }
        if let Ok(settings_json) = serde_json::to_string_pretty(&inner.settings) {
            let _ = fs::write(inner.data_dir.join("settings.json"), settings_json);
        }

        Self(Arc::new(RwLock::new(inner)))
    }

    pub async fn snapshot(&self) -> BrowserAppState {
        let lock = self.0.read().await;
        let sleeping_count = lock.tabs.iter().filter(|t| t.is_sleeping).count();
        let memory_saved_mb = (sleeping_count as f64) * 48.0;

        BrowserAppState {
            spaces: lock.spaces.clone(),
            active_space_id: lock.active_space_id.clone(),
            tabs: lock.tabs.clone(),
            active_tab_id: lock.active_tab_id.clone(),
            shield_stats: lock.shield_stats.clone(),
            resource_stats: ResourceStats {
                memory_saved_mb,
                sleeping_count,
            },
        }
    }

    pub async fn save_to_disk(&self) {
        let lock = self.0.read().await;
        let state_val = serde_json::json!({
            "spaces": lock.spaces,
            "activeSpaceId": lock.active_space_id,
            "tabs": lock.tabs,
            "activeTabId": lock.active_tab_id,
        });

        let state_path = lock.data_dir.join("state.json");
        let settings_path = lock.data_dir.join("settings.json");

        if let Ok(state_json) = serde_json::to_string_pretty(&state_val) {
            let _ = fs::write(state_path, state_json);
        }
        if let Ok(settings_json) = serde_json::to_string_pretty(&lock.settings) {
            let _ = fs::write(settings_path, settings_json);
        }
    }
}

