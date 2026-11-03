use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThreatCategory {
    Tracker,
    Advertising,
    Analytics,
    Fingerprinting,
    Cryptomining,
    Telemetry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterDecision {
    pub blocked: bool,
    pub domain: String,
    pub category: Option<ThreatCategory>,
    pub rule: Option<String>,
}

#[derive(Debug, Clone)]
pub struct FastFilterEngine {
    blocked_domains: HashSet<String>,
    whitelist: HashSet<String>,
}

impl Default for FastFilterEngine {
    fn default() -> Self {
        let mut engine = Self {
            blocked_domains: HashSet::new(),
            whitelist: HashSet::new(),
        };
        engine.init_rules();
        engine
    }
}

impl FastFilterEngine {
    pub fn new() -> Self {
        Self::default()
    }

    fn init_rules(&mut self) {
        let rules = [
            // Trackers & Pixels
            ("googletagmanager.com", ThreatCategory::Tracker),
            ("connect.facebook.net", ThreatCategory::Tracker),
            ("pixel.facebook.com", ThreatCategory::Tracker),
            ("tr.snapchat.com", ThreatCategory::Tracker),
            ("analytics.tiktok.com", ThreatCategory::Tracker),
            ("scorecardresearch.com", ThreatCategory::Tracker),
            ("quantserve.com", ThreatCategory::Tracker),
            ("moatads.com", ThreatCategory::Tracker),
            ("imrworldwide.com", ThreatCategory::Tracker),
            // Ads & Ad Networks
            ("doubleclick.net", ThreatCategory::Advertising),
            ("googleadservices.com", ThreatCategory::Advertising),
            ("googlesyndication.com", ThreatCategory::Advertising),
            ("adservice.google.com", ThreatCategory::Advertising),
            ("criteo.com", ThreatCategory::Advertising),
            ("criteo.net", ThreatCategory::Advertising),
            ("adnxs.com", ThreatCategory::Advertising),
            ("taboola.com", ThreatCategory::Advertising),
            ("outbrain.com", ThreatCategory::Advertising),
            ("rubiconproject.com", ThreatCategory::Advertising),
            ("pubmatic.com", ThreatCategory::Advertising),
            ("openx.net", ThreatCategory::Advertising),
            ("amazon-adsystem.com", ThreatCategory::Advertising),
            ("adroll.com", ThreatCategory::Advertising),
            // Analytics
            ("google-analytics.com", ThreatCategory::Analytics),
            ("analytics.google.com", ThreatCategory::Analytics),
            ("hotjar.com", ThreatCategory::Analytics),
            ("clarity.ms", ThreatCategory::Analytics),
            ("mixpanel.com", ThreatCategory::Analytics),
            ("segment.io", ThreatCategory::Analytics),
            ("amplitude.com", ThreatCategory::Analytics),
            ("newrelic.com", ThreatCategory::Analytics),
            ("nr-data.net", ThreatCategory::Analytics),
            // Fingerprinting
            ("fingerprintjs.com", ThreatCategory::Fingerprinting),
            ("fpjs.sh", ThreatCategory::Fingerprinting),
            ("augur.io", ThreatCategory::Fingerprinting),
            // Cryptominers
            ("coinhive.com", ThreatCategory::Cryptomining),
            ("coin-hive.com", ThreatCategory::Cryptomining),
            ("crypto-loot.com", ThreatCategory::Cryptomining),
            // Telemetry
            ("telemetry.mozilla.org", ThreatCategory::Telemetry),
            ("vortex.data.microsoft.com", ThreatCategory::Telemetry),
            ("telemetry.dropbox.com", ThreatCategory::Telemetry),
        ];

        for (domain, _) in rules {
            self.blocked_domains.insert(domain.to_string());
        }
    }

    pub fn check_url(&self, raw_url: &str) -> FilterDecision {
        let domain = extract_host(raw_url);

        if self.whitelist.contains(&domain) {
            return FilterDecision {
                blocked: false,
                domain,
                category: None,
                rule: Some("Whitelist".to_string()),
            };
        }

        for blocked in &self.blocked_domains {
            if domain == *blocked || domain.ends_with(&format!(".{}", blocked)) {
                let cat = categorize(blocked);
                return FilterDecision {
                    blocked: true,
                    domain,
                    category: Some(cat),
                    rule: Some(format!("Block: {}", blocked)),
                };
            }
        }

        FilterDecision {
            blocked: false,
            domain,
            category: None,
            rule: None,
        }
    }

    pub fn clean_url(&self, raw_url: &str) -> String {
        if let Some((base, query)) = raw_url.split_once('?') {
            let filtered: Vec<&str> = query
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
                        && key != "igshid"
                })
                .collect();

            if filtered.is_empty() {
                base.to_string()
            } else {
                format!("{}?{}", base, filtered.join("&"))
            }
        } else {
            raw_url.to_string()
        }
    }

    pub fn count_rules(&self) -> usize {
        self.blocked_domains.len()
    }
}

fn extract_host(url: &str) -> String {
    let clean = if let Some(idx) = url.find("://") {
        &url[idx + 3..]
    } else {
        url
    };

    let host = clean
        .split('/')
        .next()
        .unwrap_or(clean)
        .split(':')
        .next()
        .unwrap_or(clean);

    host.trim().to_lowercase()
}

fn categorize(domain: &str) -> ThreatCategory {
    if domain.contains("telemetry") {
        ThreatCategory::Telemetry
    } else if domain.contains("analytics") || domain.contains("hotjar") || domain.contains("clarity") || domain.contains("mixpanel") {
        ThreatCategory::Analytics
    } else if domain.contains("criteo") || domain.contains("doubleclick") || domain.contains("adnxs") || domain.contains("adservice") || domain.contains("outbrain") || domain.contains("taboola") {
        ThreatCategory::Advertising
    } else if domain.contains("fingerprint") || domain.contains("fpjs") {
        ThreatCategory::Fingerprinting
    } else if domain.contains("coin") {
        ThreatCategory::Cryptomining
    } else {
        ThreatCategory::Tracker
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ad_blocking() {
        let engine = FastFilterEngine::new();
        let res = engine.check_url("https://securepubads.g.doubleclick.net/gampad/ads");
        assert!(res.blocked);
        assert_eq!(res.category, Some(ThreatCategory::Advertising));
    }

    #[test]
    fn test_clean_tracking_query() {
        let engine = FastFilterEngine::new();
        let cleaned = engine.clean_url("https://example.com/item?id=100&utm_source=twitter&fbclid=abc");
        assert_eq!(cleaned, "https://example.com/item?id=100");
    }

    #[test]
    fn test_legitimate_url() {
        let engine = FastFilterEngine::new();
        let res = engine.check_url("https://github.com/rust-lang/rust");
        assert!(!res.blocked);
    }
}

