use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceGlowSettings {
    pub style: String,
    pub color: String,
    pub intensity: f64,
    pub speed: f64,
    pub size: f64,
}

impl Default for SpaceGlowSettings {
    fn default() -> Self {
        Self {
            style: "theme".to_string(),
            color: "#F59E0B".to_string(),
            intensity: 0.56,
            speed: 0.55,
            size: 0.58,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceThemePoint {
    pub color: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceTheme {
    pub points: Vec<SpaceThemePoint>,
    pub intensity: f64,
    pub grain: f64,
    pub mode: String,
    #[serde(default)]
    pub glow: Option<SpaceGlowSettings>,
}

impl Default for SpaceTheme {
    fn default() -> Self {
        Self {
            points: vec![
                SpaceThemePoint {
                    color: "#0F6B4B".to_string(),
                    x: 0.28,
                    y: 0.3,
                },
                SpaceThemePoint {
                    color: "#0A2F23".to_string(),
                    x: 0.72,
                    y: 0.72,
                },
            ],
            intensity: 0.72,
            grain: 0.26,
            mode: "dark".to_string(),
            glow: Some(SpaceGlowSettings::default()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomSpaceThemePreset {
    pub id: String,
    pub name: String,
    pub theme: SpaceTheme,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceStatus {
    pub hardware_acceleration: bool,
    pub gpu_disabled_flag: bool,
    pub software_rasterized: bool,
    pub reduced_effects_mode: String,
    pub reduced_effects_active: bool,
    pub gpu_feature_status: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSettings {
    #[serde(default = "default_true")]
    pub adblock_enabled: bool,
    #[serde(default = "default_true")]
    pub zen_sleep_enabled: bool,
    #[serde(default = "default_search_engine")]
    pub search_engine: String,
    #[serde(default = "default_reduced_effects")]
    pub reduced_effects_mode: String,
    #[serde(default)]
    pub space_themes: HashMap<String, SpaceTheme>,
    #[serde(default)]
    pub custom_theme_presets: Vec<CustomSpaceThemePreset>,
    #[serde(default)]
    pub shield_whitelist: Vec<String>,
    #[serde(default = "default_archive_interval")]
    pub archive_interval_hours: serde_json::Value,
    #[serde(default = "default_true")]
    pub right_pins_dock_visible: bool,
    #[serde(default = "default_true")]
    pub sidebar_expanded: bool,
    #[serde(default = "default_false")]
    pub sidebar_auto_hide: bool,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

fn default_true() -> bool {
    true
}
fn default_false() -> bool {
    false
}
fn default_search_engine() -> String {
    "google".to_string()
}
fn default_reduced_effects() -> String {
    "auto".to_string()
}
fn default_archive_interval() -> serde_json::Value {
    serde_json::Value::from(12)
}

impl Default for BrowserSettings {
    fn default() -> Self {
        let mut themes = HashMap::new();
        themes.insert("space-study".to_string(), SpaceTheme::default());
        themes.insert(
            "space-work".to_string(),
            SpaceTheme {
                points: vec![
                    SpaceThemePoint {
                        color: "#1E3A8A".to_string(),
                        x: 0.28,
                        y: 0.3,
                    },
                    SpaceThemePoint {
                        color: "#0F172A".to_string(),
                        x: 0.72,
                        y: 0.72,
                    },
                ],
                intensity: 0.70,
                grain: 0.22,
                mode: "dark".to_string(),
                glow: Some(SpaceGlowSettings {
                    style: "theme".to_string(),
                    color: "#3B82F6".to_string(),
                    intensity: 0.55,
                    speed: 0.55,
                    size: 0.58,
                }),
            },
        );
        themes.insert(
            "space-leisure".to_string(),
            SpaceTheme {
                points: vec![
                    SpaceThemePoint {
                        color: "#701A75".to_string(),
                        x: 0.28,
                        y: 0.3,
                    },
                    SpaceThemePoint {
                        color: "#2E1065".to_string(),
                        x: 0.72,
                        y: 0.72,
                    },
                ],
                intensity: 0.68,
                grain: 0.24,
                mode: "dark".to_string(),
                glow: Some(SpaceGlowSettings {
                    style: "theme".to_string(),
                    color: "#EC4899".to_string(),
                    intensity: 0.58,
                    speed: 0.55,
                    size: 0.58,
                }),
            },
        );

        Self {
            adblock_enabled: true,
            zen_sleep_enabled: true,
            search_engine: "google".to_string(),
            reduced_effects_mode: "auto".to_string(),
            space_themes: themes,
            custom_theme_presets: Vec::new(),
            shield_whitelist: Vec::new(),
            archive_interval_hours: serde_json::Value::from(12),
            right_pins_dock_visible: true,
            sidebar_expanded: true,
            sidebar_auto_hide: false,
            extra: HashMap::new(),
        }
    }
}

