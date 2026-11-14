use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabState {
    pub id: String,
    pub space_id: String,
    pub title: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favicon: Option<String>,
    pub is_loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    pub is_pinned: bool,
    pub is_sleeping: bool,
    pub blocked_count: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom_factor: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_active_at: Option<i64>,
}

impl TabState {
    pub fn new(id: String, space_id: String, url: Option<String>) -> Self {
        let initial_url = url.unwrap_or_else(|| "neutrino://newtab".to_string());
        let title = if initial_url == "neutrino://newtab" || initial_url.is_empty() {
            "New Tab".to_string()
        } else {
            initial_url.clone()
        };

        Self {
            id,
            space_id,
            title,
            url: initial_url,
            favicon: None,
            is_loading: false,
            can_go_back: false,
            can_go_forward: false,
            is_pinned: false,
            is_sleeping: false,
            blocked_count: 0,
            zoom_factor: Some(1.0),
            preview_image: None,
            last_active_at: Some(chrono::Utc::now().timestamp_millis()),
        }
    }
}

