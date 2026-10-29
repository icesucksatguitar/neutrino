use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThreatCategory {
    Tracker,
    Analytics,
    Advertising,
    Fingerprinter,
    Cryptominer,
    Telemetry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterDecision {
    pub blocked: bool,
    pub domain: String,
    pub category: Option<ThreatCategory>,
    pub rule_matched: Option<String>,
}

#[derive(Debug, Clone)]
pub struct FilterEngine {
    blocked_domains: HashSet<String>,
    whitelist_domains: HashSet<String>,
}

impl Default for FilterEngine {
    fn default() -> Self {
        let mut engine = Self {
            blocked_domains: HashSet::new(),
            whitelist_domains: HashSet::new(),
        };
        engine.seed_rules();
        engine
    }
}

impl FilterEngine {
    pub fn new() -> Self {
        Self::default()
    }

    fn seed_rules(&mut self) {
        let default_blocks = [
            // Major Analytics & Tracking Networks
            ("google-analytics.com", ThreatCategory::Analytics),
            ("analytics.google.com", ThreatCategory::Analytics),
            ("googletagmanager.com", ThreatCategory::Tracker),
            ("doubleclick.net", ThreatCategory::Advertising),
            ("connect.facebook.net", ThreatCategory::Tracker),
            ("pixel.facebook.com", ThreatCategory::Tracker),
            ("hotjar.com", ThreatCategory::Analytics),
            ("clarity.ms", ThreatCategory::Analytics),
            ("mixpanel.com", ThreatCategory::Analytics),
            ("segment.io", ThreatCategory::Analytics),
            ("criteo.com", ThreatCategory::Advertising),
            ("criteo.net", ThreatCategory::Advertising),
            ("adnxs.com", ThreatCategory::Advertising),
            ("taboola.com", ThreatCategory::Advertising),
            ("outbrain.com", ThreatCategory::Advertising),
            ("scorecardresearch.com", ThreatCategory::Tracker),
            ("quantserve.com", ThreatCategory::Analytics),
            // Telemetry & Data Harvesting
            ("telemetry.mozilla.org", ThreatCategory::Telemetry),
            ("incoming.telemetry.mozilla.org", ThreatCategory::Telemetry),
            ("data.flurry.com", ThreatCategory::Telemetry),
            ("app-measurement.com", ThreatCategory::Analytics),
            // Fingerprinting
            ("fingerprintjs.com", ThreatCategory::Fingerprinter),
            ("fpjs.sh", ThreatCategory::Fingerprinter),
            // Cryptominers
            ("coinhive.com", ThreatCategory::Cryptominer),
            ("coin-hive.com", ThreatCategory::Cryptominer),
        ];

        for (domain, _) in default_blocks {
            self.blocked_domains.insert(domain.to_string());
        }
    }

    pub fn add_custom_rule(&mut self, domain: &str, block: bool) {
        let clean = domain.trim().to_lowercase();
        if block {
            self.whitelist_domains.remove(&clean);
            self.blocked_domains.insert(clean);
        } else {
            self.blocked_domains.remove(&clean);
            self.whitelist_domains.insert(clean);
        }
    }

    pub fn evaluate_url(&self, raw_url: &str) -> FilterDecision {
        let domain = extract_domain(raw_url);

        // Check whitelist first
        if self.whitelist_domains.contains(&domain) {
            return FilterDecision {
                blocked: false,
                domain,
                category: None,
                rule_matched: Some("User Whitelist".to_string()),
            };
        }

        // Exact match or subdomain match
        for blocked in &self.blocked_domains {
            if domain == *blocked || domain.ends_with(&format!(".{}", blocked)) {
                let category = categorize_domain(blocked);
                return FilterDecision {
                    blocked: true,
                    domain,
                    category: Some(category),
                    rule_matched: Some(format!("Blocklist: {}", blocked)),
                };
            }
        }

        FilterDecision {
            blocked: false,
            domain,
            category: None,
            rule_matched: None,
        }
    }

    pub fn total_rules_count(&self) -> usize {
        self.blocked_domains.len()
    }
}

fn extract_domain(url: &str) -> String {
    let without_protocol = if let Some(idx) = url.find("://") {
        &url[idx + 3..]
    } else {
        url
    };

    let domain_part = without_protocol
        .split('/')
        .next()
        .unwrap_or(without_protocol)
        .split(':')
        .next()
        .unwrap_or(without_protocol);

    domain_part.trim().to_lowercase()
}

fn categorize_domain(domain: &str) -> ThreatCategory {
    if domain.contains("telemetry") {
        ThreatCategory::Telemetry
    } else if domain.contains("analytics") || domain.contains("hotjar") || domain.contains("clarity") {
        ThreatCategory::Analytics
    } else if domain.contains("criteo") || domain.contains("doubleclick") || domain.contains("adnxs") {
        ThreatCategory::Advertising
    } else if domain.contains("fingerprint") || domain.contains("fpjs") {
        ThreatCategory::Fingerprinter
    } else if domain.contains("coin") {
        ThreatCategory::Cryptominer
    } else {
        ThreatCategory::Tracker
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tracker_blocking() {
        let engine = FilterEngine::new();
        let result = engine.evaluate_url("https://www.google-analytics.com/analytics.js");
        assert!(result.blocked);
        assert_eq!(result.category, Some(ThreatCategory::Analytics));
    }

    #[test]
    fn test_subdomain_matching() {
        let engine = FilterEngine::new();
        let result = engine.evaluate_url("https://sub.doubleclick.net/ad?id=123");
        assert!(result.blocked);
    }

    #[test]
    fn test_safe_url() {
        let engine = FilterEngine::new();
        let result = engine.evaluate_url("https://github.com/torvalds/linux");
        assert!(!result.blocked);
    }

    #[test]
    fn test_whitelist_override() {
        let mut engine = FilterEngine::new();
        engine.add_custom_rule("google-analytics.com", false);
        let result = engine.evaluate_url("https://google-analytics.com/test");
        assert!(!result.blocked);
    }
}
