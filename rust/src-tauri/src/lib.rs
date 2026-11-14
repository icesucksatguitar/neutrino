mod commands;
mod history;
mod importer;
mod settings;
mod shields;
mod spaces;
mod state;
mod tabs;

use state::AppState;
use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub fn run() {
    let _ = tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("com.neutrino.browser"));
            let state = AppState::new(app_data_dir);
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_browser_state,
            commands::get_settings,
            commands::update_settings,
            commands::get_performance_status,
            commands::create_tab,
            commands::close_tab,
            commands::select_tab,
            commands::update_tab,
            commands::toggle_pin_tab,
            commands::toggle_sleep_tab,
            commands::reorder_tabs,
            commands::select_space,
            commands::create_space,
            commands::delete_space,
            commands::update_space,
            commands::reorder_space,
            commands::toggle_shields,
            commands::toggle_site_whitelist,
            commands::get_shield_stats,
            commands::reset_shield_stats,
            commands::zen_optimize,
            commands::window_control,
            commands::get_history,
            commands::clear_history,
            commands::delete_history_entry,
            commands::get_vpn_status,
            commands::connect_vpn,
            commands::disconnect_vpn,
            commands::check_vpn_ip,
            commands::capture_tab_preview,
            commands::get_tab_preview,
            commands::mcp_call,
            commands::get_mcp_logs,
            commands::passwords_status,
            commands::passwords_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running neutrino browser");
}

