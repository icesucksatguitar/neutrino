use serde::{Deserialize, Serialize};

pub const CUSTOM_SPACE_PALETTE: &[(&str, &str)] = &[
    ("#8B5CF6", "Sparkles"),
    ("#3B82F6", "Compass"),
    ("#10B981", "Leaf"),
    ("#F59E0B", "Sun"),
    ("#EC4899", "Flame"),
    ("#06B6D4", "Globe"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<i32>,
}

pub fn default_spaces() -> Vec<Space> {
    vec![
        Space {
            id: "space-study".to_string(),
            name: "Study".to_string(),
            icon: "BookOpen".to_string(),
            color: "#E4E4E7".to_string(),
            profile_id: Some("profile-default".to_string()),
            order: Some(0),
        },
        Space {
            id: "space-work".to_string(),
            name: "Work".to_string(),
            icon: "Briefcase".to_string(),
            color: "#A1A1AA".to_string(),
            profile_id: Some("profile-default".to_string()),
            order: Some(1),
        },
        Space {
            id: "space-leisure".to_string(),
            name: "Leisure".to_string(),
            icon: "Coffee".to_string(),
            color: "#71717A".to_string(),
            profile_id: Some("profile-default".to_string()),
            order: Some(2),
        },
    ]
}

