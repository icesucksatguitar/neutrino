use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryScrubber {
    pub strip_referer: bool,
    pub strip_utm_parameters: bool,
    pub block_ping_attribute: bool,
}

impl Default for TelemetryScrubber {
    fn default() -> Self {
        Self {
            strip_referer: true,
            strip_utm_parameters: true,
            block_ping_attribute: true,
        }
    }
}

impl TelemetryScrubber {
    pub fn new() -> Self {
        Self::default()
    }

    /// Strips tracking parameters such as utm_source, utm_medium, fbclid, gclid from incoming URLs
    pub fn clean_url_tracking_params(&self, url: &str) -> String {
        if !self.strip_utm_parameters {
            return url.to_string();
        }

        if let Some((base, query)) = url.split_once('?') {
            let filtered_params: Vec<&str> = query
                .split('&')
                .filter(|param| {
                    let key = param.split('=').next().unwrap_or("").to_lowercase();
                    !key.starts_with("utm_")
                        && key != "fbclid"
                        && key != "gclid"
                        && key != "msclkid"
                        && key != "mc_eid"
                        && key != "_hsenc"
                        && key != "dclid"
                })
                .collect();

            if filtered_params.is_empty() {
                base.to_string()
            } else {
                format!("{}?{}", base, filtered_params.join("&"))
            }
        } else {
            url.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_utm_params() {
        let scrubber = TelemetryScrubber::new();
        let dirty = "https://example.com/page?utm_source=newsletter&utm_medium=email&article_id=42&fbclid=IwAR123";
        let cleaned = scrubber.clean_url_tracking_params(dirty);
        assert_eq!(cleaned, "https://example.com/page?article_id=42");
    }

    #[test]
    fn test_clean_only_tracking_params() {
        let scrubber = TelemetryScrubber::new();
        let dirty = "https://example.com/page?gclid=XYZ999";
        let cleaned = scrubber.clean_url_tracking_params(dirty);
        assert_eq!(cleaned, "https://example.com/page");
    }
}

