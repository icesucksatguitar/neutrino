use crate::history::{HistoryEntry, HistoryQueryOptions};
use crate::settings::{BrowserSettings, CustomSpaceThemePreset, PerformanceStatus, SpaceTheme};
use crate::shields::ShieldStats;
use crate::spaces::{Space, CUSTOM_SPACE_PALETTE};
use crate::state::{AppState, BrowserAppState};
use crate::tabs::TabState;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State, Window};
use tracing::info;

#[tauri::command]
pub async fn get_browser_state(state: State<'_, AppState>) -> Result<BrowserAppState, String> {
    Ok(state.snapshot().await)
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<BrowserSettings, String> {
    let lock = state.0.read().await;
    Ok(lock.settings.clone())
}

#[tauri::command]
pub async fn update_settings(
    patch: serde_json::Value,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BrowserSettings, String> {
    let mut lock = state.0.write().await;
    if let serde_json::Value::Object(map) = patch {
        for (k, v) in map {
            match k.as_str() {
                "adblockEnabled" => {
                    if let Some(b) = v.as_bool() {
                        lock.settings.adblock_enabled = b;
                        lock.shield_engine.set_enabled(b);
                    }
                }
                "zenSleepEnabled" => {
                    if let Some(b) = v.as_bool() {
                        lock.settings.zen_sleep_enabled = b;
                    }
                }
                "searchEngine" => {
                    if let Some(s) = v.as_str() {
                        lock.settings.search_engine = s.to_string();
                    }
                }
                "reducedEffectsMode" => {
                    if let Some(s) = v.as_str() {
                        lock.settings.reduced_effects_mode = s.to_string();
                    }
                }
                "shieldWhitelist" => {
                    if let Ok(list) = serde_json::from_value::<Vec<String>>(v.clone()) {
                        lock.settings.shield_whitelist = list.clone();
                        lock.shield_engine.set_whitelist(list);
                    }
                }
                "customThemePresets" => {
                    if let Ok(presets) = serde_json::from_value::<Vec<CustomSpaceThemePreset>>(v.clone()) {
                        lock.settings.custom_theme_presets = presets;
                    }
                }
                "spaceThemes" => {
                    if let Ok(themes) = serde_json::from_value::<HashMap<String, SpaceTheme>>(v.clone()) {
                        for (sp_id, theme) in themes {
                            lock.settings.space_themes.insert(sp_id, theme);
                        }
                    }
                }
                "sidebarExpanded" => {
                    if let Some(b) = v.as_bool() {
                        lock.settings.sidebar_expanded = b;
                    }
                }
                "sidebarAutoHide" => {
                    if let Some(b) = v.as_bool() {
                        lock.settings.sidebar_auto_hide = b;
                    }
                }
                "rightPinsDockVisible" => {
                    if let Some(b) = v.as_bool() {
                        lock.settings.right_pins_dock_visible = b;
                    }
                }
                "archiveIntervalHours" => {
                    lock.settings.archive_interval_hours = v.clone();
                }
                _ => {
                    lock.settings.extra.insert(k, v);
                }
            }
        }
    }
    let updated = lock.settings.clone();
    drop(lock);

    state.save_to_disk().await;
    let _ = app.emit("neutrino:settings-updated", &updated);
    Ok(updated)
}

#[tauri::command]
pub async fn get_performance_status(state: State<'_, AppState>) -> Result<PerformanceStatus, String> {
    let lock = state.0.read().await;
    let mut feature_status = HashMap::new();
    feature_status.insert("direct_rendering_display_compositor".to_string(), "enabled".to_string());
    feature_status.insert("rasterization".to_string(), "enabled".to_string());
    feature_status.insert("gpu_compositing".to_string(), "enabled".to_string());

    let is_on = lock.settings.reduced_effects_mode == "on";
    Ok(PerformanceStatus {
        hardware_acceleration: true,
        gpu_disabled_flag: false,
        software_rasterized: false,
        reduced_effects_mode: lock.settings.reduced_effects_mode.clone(),
        reduced_effects_active: is_on,
        gpu_feature_status: feature_status,
    })
}

#[tauri::command]
pub async fn create_tab(
    url: Option<String>,
    space_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TabState, String> {
    let mut lock = state.0.write().await;
    let target_space = space_id.unwrap_or_else(|| lock.active_space_id.clone());
    let tab_id = format!("tab-{}-{}", chrono::Utc::now().timestamp_millis(), uuid::Uuid::new_v4().simple());
    let new_tab = TabState::new(tab_id.clone(), target_space.clone(), url);

    lock.tabs.push(new_tab.clone());
    if lock.active_space_id == target_space {
        lock.active_tab_id = Some(tab_id);
    }
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(new_tab)
}

#[tauri::command]
pub async fn close_tab(
    tab_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut lock = state.0.write().await;
    let index = lock.tabs.iter().position(|t| t.id == tab_id);
    if let Some(idx) = index {
        let _removed = lock.tabs.remove(idx);
        if lock.active_tab_id == Some(tab_id.clone()) {
            let active_space = lock.active_space_id.clone();
            let remaining: Vec<_> = lock.tabs.iter().filter(|t| t.space_id == active_space).collect();
            if remaining.is_empty() {
                let fallback = TabState::new(
                    format!("tab-{}", chrono::Utc::now().timestamp_millis()),
                    active_space,
                    Some("neutrino://newtab".to_string()),
                );
                lock.active_tab_id = Some(fallback.id.clone());
                lock.tabs.push(fallback);
            } else {
                let next_idx = idx.min(remaining.len().saturating_sub(1));
                lock.active_tab_id = Some(remaining[next_idx].id.clone());
            }
        }
    }
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(())
}

#[tauri::command]
pub async fn select_tab(
    tab_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut lock = state.0.write().await;
    if let Some(tab) = lock.tabs.iter_mut().find(|t| t.id == tab_id) {
        tab.is_sleeping = false;
        tab.last_active_at = Some(chrono::Utc::now().timestamp_millis());
        lock.active_tab_id = Some(tab_id);
    }
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(())
}

#[tauri::command]
pub async fn update_tab(
    tab_id: String,
    partial: serde_json::Value,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut lock = state.0.write().await;
    if let Some(tab) = lock.tabs.iter_mut().find(|t| t.id == tab_id) {
        if let Some(title) = partial.get("title").and_then(|v| v.as_str()) {
            tab.title = title.to_string();
        }
        if let Some(url) = partial.get("url").and_then(|v| v.as_str()) {
            tab.url = url.to_string();
        }
        if let Some(favicon) = partial.get("favicon").and_then(|v| v.as_str()) {
            tab.favicon = Some(favicon.to_string());
        }
        if let Some(loading) = partial.get("isLoading").and_then(|v| v.as_bool()) {
            tab.is_loading = loading;
        }
        if let Some(can_back) = partial.get("canGoBack").and_then(|v| v.as_bool()) {
            tab.can_go_back = can_back;
        }
        if let Some(can_fwd) = partial.get("canGoForward").and_then(|v| v.as_bool()) {
            tab.can_go_forward = can_fwd;
        }
        if let Some(zoom) = partial.get("zoomFactor").and_then(|v| v.as_f64()) {
            tab.zoom_factor = Some(zoom);
        }
        if let Some(preview) = partial.get("previewImage").and_then(|v| v.as_str()) {
            tab.preview_image = Some(preview.to_string());
        }
    }
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(())
}

#[tauri::command]
pub async fn toggle_pin_tab(
    tab_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut lock = state.0.write().await;
    if let Some(tab) = lock.tabs.iter_mut().find(|t| t.id == tab_id) {
        tab.is_pinned = !tab.is_pinned;
    }
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(())
}

#[tauri::command]
pub async fn toggle_sleep_tab(
    tab_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut lock = state.0.write().await;
    if let Some(tab) = lock.tabs.iter_mut().find(|t| t.id == tab_id) {
        tab.is_sleeping = !tab.is_sleeping;
    }
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(())
}

#[tauri::command]
pub async fn reorder_tabs(
    dragged_tab_id: String,
    target_tab_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut lock = state.0.write().await;
    let from_idx = lock.tabs.iter().position(|t| t.id == dragged_tab_id);
    let to_idx = lock.tabs.iter().position(|t| t.id == target_tab_id);
    if let (Some(f), Some(t)) = (from_idx, to_idx) {
        let item = lock.tabs.remove(f);
        lock.tabs.insert(t, item);
    }
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(())
}

#[tauri::command]
pub async fn select_space(
    space_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut lock = state.0.write().await;
    if lock.spaces.iter().any(|s| s.id == space_id) {
        lock.active_space_id = space_id.clone();
        let space_tabs: Vec<_> = lock.tabs.iter().filter(|t| t.space_id == space_id).collect();
        if space_tabs.is_empty() {
            let fallback = TabState::new(
                format!("tab-{}", chrono::Utc::now().timestamp_millis()),
                space_id,
                Some("neutrino://newtab".to_string()),
            );
            lock.active_tab_id = Some(fallback.id.clone());
            lock.tabs.push(fallback);
        } else if !space_tabs.iter().any(|t| Some(&t.id) == lock.active_tab_id.as_ref()) {
            lock.active_tab_id = Some(space_tabs[0].id.clone());
        }
    }
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(())
}

#[tauri::command]
pub async fn create_space(
    name: String,
    color: Option<String>,
    profile_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<Space>, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let mut lock = state.0.write().await;
    let palette_entry = CUSTOM_SPACE_PALETTE[lock.spaces.len() % CUSTOM_SPACE_PALETTE.len()];
    let final_color = color
        .filter(|c| c.starts_with('#') && c.len() == 7)
        .unwrap_or_else(|| palette_entry.0.to_string());

    let space_id = format!("space-{}-{}", chrono::Utc::now().timestamp_millis(), uuid::Uuid::new_v4().simple());
    let new_space = Space {
        id: space_id.clone(),
        name: trimmed.chars().take(32).collect(),
        icon: palette_entry.1.to_string(),
        color: final_color.clone(),
        profile_id,
        order: Some(lock.spaces.len() as i32),
    };

    // Initialize default theme for the new space
    let mut base_theme = lock.settings.space_themes.get("space-study").cloned().unwrap_or_default();
    if let Some(pt1) = base_theme.points.get_mut(0) {
        pt1.color = final_color;
    }
    lock.settings.space_themes.insert(space_id.clone(), base_theme);

    lock.spaces.push(new_space.clone());
    lock.active_space_id = space_id.clone();

    // Create an initial new tab in this space
    let tab = TabState::new(
        format!("tab-{}", chrono::Utc::now().timestamp_millis()),
        space_id,
        Some("neutrino://newtab".to_string()),
    );
    lock.active_tab_id = Some(tab.id.clone());
    lock.tabs.push(tab);

    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(Some(new_space))
}

#[tauri::command]
pub async fn delete_space(
    space_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut lock = state.0.write().await;
    if lock.spaces.len() <= 1 {
        return Ok(serde_json::json!({ "ok": false, "error": "last-space" }));
    }

    let pos = lock.spaces.iter().position(|s| s.id == space_id);
    if let Some(idx) = pos {
        lock.spaces.remove(idx);
        lock.tabs.retain(|t| t.space_id != space_id);
        lock.settings.space_themes.remove(&space_id);

        if lock.active_space_id == space_id {
            lock.active_space_id = lock.spaces[0].id.clone();
            let remaining: Vec<_> = lock.tabs.iter().filter(|t| t.space_id == lock.active_space_id).collect();
            if remaining.is_empty() {
                let tab = TabState::new(
                    format!("tab-{}", chrono::Utc::now().timestamp_millis()),
                    lock.active_space_id.clone(),
                    Some("neutrino://newtab".to_string()),
                );
                lock.active_tab_id = Some(tab.id.clone());
                lock.tabs.push(tab);
            } else {
                lock.active_tab_id = Some(remaining[0].id.clone());
            }
        }
    }
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn update_space(
    space_id: String,
    patch: serde_json::Value,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut lock = state.0.write().await;
    if let Some(space) = lock.spaces.iter_mut().find(|s| s.id == space_id) {
        if let Some(name) = patch.get("name").and_then(|v| v.as_str()) {
            space.name = name.trim().chars().take(32).collect();
        }
        if let Some(color) = patch.get("color").and_then(|v| v.as_str()) {
            space.color = color.to_string();
        }
        if let Some(icon) = patch.get("icon").and_then(|v| v.as_str()) {
            space.icon = icon.to_string();
        }
        let updated = space.clone();
        drop(lock);
        state.save_to_disk().await;
        let snapshot = state.snapshot().await;
        let _ = app.emit("neutrino:state-update", &snapshot);
        return Ok(serde_json::json!({ "ok": true, "space": updated }));
    }
    Ok(serde_json::json!({ "ok": false, "error": "not-found" }))
}

#[tauri::command]
pub async fn reorder_space(
    space_id: String,
    to_index: usize,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut lock = state.0.write().await;
    if let Some(from) = lock.spaces.iter().position(|s| s.id == space_id) {
        let item = lock.spaces.remove(from);
        let target = to_index.min(lock.spaces.len());
        lock.spaces.insert(target, item);
        for (i, sp) in lock.spaces.iter_mut().enumerate() {
            sp.order = Some(i as i32);
        }
    }
    drop(lock);
    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn toggle_shields(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    let mut lock = state.0.write().await;
    lock.settings.adblock_enabled = !lock.settings.adblock_enabled;
    let enabled = lock.settings.adblock_enabled;
    lock.shield_engine.set_enabled(enabled);
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(enabled)
}

#[tauri::command]
pub async fn toggle_site_whitelist(
    domain_or_url: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut host = domain_or_url.trim().to_lowercase();
    if host.starts_with("http://") || host.starts_with("https://") {
        if let Ok(u) = url::Url::parse(&host) {
            if let Some(h) = u.host_str() {
                host = h.to_string();
            }
        }
    }
    host = host.split(':').next().unwrap_or("").to_string();

    let mut lock = state.0.write().await;
    let mut whitelisted = false;
    if let Some(pos) = lock.settings.shield_whitelist.iter().position(|w| w == &host) {
        lock.settings.shield_whitelist.remove(pos);
    } else if !host.is_empty() {
        lock.settings.shield_whitelist.push(host.clone());
        whitelisted = true;
    }
    let list = lock.settings.shield_whitelist.clone();
    lock.shield_engine.set_whitelist(list.clone());
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(serde_json::json!({
        "domain": host,
        "whitelisted": whitelisted,
        "shieldWhitelist": list
    }))
}

#[tauri::command]
pub async fn get_shield_stats(state: State<'_, AppState>) -> Result<ShieldStats, String> {
    let lock = state.0.read().await;
    Ok(lock.shield_stats.clone())
}

#[tauri::command]
pub async fn reset_shield_stats(state: State<'_, AppState>) -> Result<ShieldStats, String> {
    let mut lock = state.0.write().await;
    lock.shield_stats = ShieldStats::default();
    Ok(lock.shield_stats.clone())
}

#[tauri::command]
pub async fn zen_optimize(app: AppHandle, state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let mut lock = state.0.write().await;
    let mut slept = 0;
    let active_id = lock.active_tab_id.clone();
    for tab in lock.tabs.iter_mut() {
        if Some(&tab.id) != active_id.as_ref() && !tab.is_pinned && !tab.is_sleeping {
            tab.is_sleeping = true;
            slept += 1;
        }
    }
    let memory_saved_mb = (slept as f64) * 48.0;
    drop(lock);

    state.save_to_disk().await;
    let snapshot = state.snapshot().await;
    let _ = app.emit("neutrino:state-update", &snapshot);
    Ok(serde_json::json!({
        "memorySavedMb": memory_saved_mb,
        "sleepingCount": slept
    }))
}

#[tauri::command]
pub async fn window_control(action: String, window: Window) -> Result<(), String> {
    match action.as_str() {
        "minimize" => {
            let _ = window.minimize();
        }
        "maximize" => {
            if window.is_maximized().unwrap_or(false) {
                let _ = window.unmaximize();
            } else {
                let _ = window.maximize();
            }
        }
        "close" => {
            let _ = window.close();
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub async fn get_history(
    options: Option<HistoryQueryOptions>,
    state: State<'_, AppState>,
) -> Result<Vec<HistoryEntry>, String> {
    let lock = state.0.read().await;
    let opts = options.unwrap_or_default();
    let mut list: Vec<_> = lock.history.clone();

    if let Some(q) = opts.query {
        let q_lower = q.to_lowercase();
        list.retain(|h| h.title.to_lowercase().contains(&q_lower) || h.url.to_lowercase().contains(&q_lower));
    }
    if let Some(sp) = opts.space_id {
        list.retain(|h| h.space_id.as_deref() == Some(&sp));
    }

    list.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    let offset = opts.offset.unwrap_or(0);
    let limit = opts.limit.unwrap_or(100);

    let paged = list.into_iter().skip(offset).take(limit).collect();
    Ok(paged)
}

#[tauri::command]
pub async fn clear_history(
    range: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let mut lock = state.0.write().await;
    let count = lock.history.len();
    let now = chrono::Utc::now().timestamp_millis();

    match range.as_deref() {
        Some("hour") => {
            let hour_ago = now - 3600 * 1000;
            lock.history.retain(|h| h.timestamp < hour_ago);
        }
        Some("day") => {
            let day_ago = now - 86400 * 1000;
            lock.history.retain(|h| h.timestamp < day_ago);
        }
        _ => {
            lock.history.clear();
        }
    }
    let removed = count.saturating_sub(lock.history.len());
    let remaining = lock.history.clone();
    drop(lock);

    let _ = app.emit("neutrino:history-updated", &remaining);
    Ok(removed)
}

#[tauri::command]
pub async fn delete_history_entry(
    target: serde_json::Value,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut lock = state.0.write().await;
    let mut found = false;
    if let Some(id) = target.get("id").and_then(|v| v.as_str()) {
        if let Some(idx) = lock.history.iter().position(|h| h.id == id) {
            lock.history.remove(idx);
            found = true;
        }
    } else if let Some(url) = target.get("url").and_then(|v| v.as_str()) {
        lock.history.retain(|h| h.url != url);
        found = true;
    }
    let remaining = lock.history.clone();
    drop(lock);

    if found {
        let _ = app.emit("neutrino:history-updated", &remaining);
    }
    Ok(found)
}

#[tauri::command]
pub async fn get_vpn_status() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "isConnected": false,
        "mode": "off",
        "server": null,
        "country": null,
        "ip": null,
        "latencyMs": null
    }))
}

#[tauri::command]
pub async fn connect_vpn() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "isConnected": true,
        "mode": "smart",
        "server": "Zurich, CH",
        "country": "CH",
        "ip": "185.220.101.5",
        "latencyMs": 42
    }))
}

#[tauri::command]
pub async fn disconnect_vpn() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "isConnected": false,
        "mode": "off",
        "server": null,
        "country": null,
        "ip": null,
        "latencyMs": null
    }))
}

#[tauri::command]
pub async fn check_vpn_ip() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "ip": "127.0.0.1",
        "country": "Local",
        "city": "Workstation",
        "isVpn": false
    }))
}

#[tauri::command]
pub async fn capture_tab_preview(
    tab_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let lock = state.0.read().await;
    if let Some(tab) = lock.tabs.iter().find(|t| t.id == tab_id) {
        return Ok(tab.preview_image.clone());
    }
    Ok(None)
}

#[tauri::command]
pub async fn get_tab_preview(
    tab_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    capture_tab_preview(tab_id, state).await
}

#[tauri::command]
pub async fn mcp_call(method: String, params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    info!("MCP call: {} params: {:?}", method, params);
    match method.as_str() {
        "initialize" => Ok(serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "serverInfo": {
                "name": "neutrino-mcp",
                "version": "0.3.0"
            }
        })),
        "tools/list" => Ok(serde_json::json!({
            "tools": [
                {
                    "name": "navigate",
                    "description": "Navigate active browser tab to a URL",
                    "inputSchema": {
                        "type": "object",
                        "properties": { "url": { "type": "string" } },
                        "required": ["url"]
                    }
                },
                {
                    "name": "list_tabs",
                    "description": "List all open tabs in current Space",
                    "inputSchema": { "type": "object", "properties": {} }
                }
            ]
        })),
        _ => Ok(serde_json::json!({ "ok": true })),
    }
}

#[tauri::command]
pub async fn get_mcp_logs() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![
        serde_json::json!({
            "timestamp": chrono::Utc::now().timestamp_millis(),
            "level": "info",
            "message": "Neutrino Tauri MCP server initialized"
        })
    ])
}

#[tauri::command]
pub async fn passwords_status() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "ok": true,
        "encryptionAvailable": true
    }))
}

#[tauri::command]
pub async fn passwords_list() -> Result<Vec<serde_json::Value>, String> {
    Ok(Vec::new())
}

