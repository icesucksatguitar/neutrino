use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShieldStats {
    pub total_blocked: i64,
    pub ads_blocked: i64,
    pub trackers_blocked: i64,
    pub analytics_blocked: i64,
    pub fingerprinters_blocked: i64,
    pub data_saved_kb: i64,
}

impl Default for ShieldStats {
    fn default() -> Self {
        Self {
            total_blocked: 0,
            ads_blocked: 0,
            trackers_blocked: 0,
            analytics_blocked: 0,
            fingerprinters_blocked: 0,
            data_saved_kb: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct BlockedTrackerItem {
    pub url: String,
    pub domain: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule: Option<String>,
    pub timestamp: i64,
}

pub struct ShieldEngine {
    enabled: bool,
    whitelist: HashSet<String>,
    #[allow(dead_code)]
    blocked_domains: HashSet<&'static str>,
}

impl Default for ShieldEngine {
    fn default() -> Self {
        let mut domains = HashSet::new();
        // Common ad networks
        domains.insert("doubleclick.net");
        domains.insert("googleadservices.com");
        domains.insert("googlesyndication.com");
        domains.insert("adservice.google.com");
        domains.insert("adnxs.com");
        domains.insert("criteo.com");
        domains.insert("criteo.net");
        domains.insert("rubiconproject.com");
        domains.insert("pubmatic.com");
        domains.insert("openx.net");
        domains.insert("amazon-adsystem.com");
        domains.insert("adroll.com");
        domains.insert("advertising.com");
        domains.insert("taboola.com");
        domains.insert("outbrain.com");
        domains.insert("popads.net");
        domains.insert("adcolony.com");
        // Trackers & telemetry
        domains.insert("google-analytics.com");
        domains.insert("analytics.google.com");
        domains.insert("googletagmanager.com");
        domains.insert("pixel.facebook.com");
        domains.insert("tr.snapchat.com");
        domains.insert("analytics.tiktok.com");
        domains.insert("ads.tiktok.com");
        domains.insert("scorecardresearch.com");
        domains.insert("quantserve.com");
        domains.insert("hotjar.com");
        domains.insert("mouseflow.com");
        domains.insert("segment.io");
        domains.insert("mixpanel.com");
        domains.insert("amplitude.com");

        Self {
            enabled: true,
            whitelist: HashSet::new(),
            blocked_domains: domains,
        }
    }
}

#[allow(dead_code)]
impl ShieldEngine {
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    pub fn set_whitelist(&mut self, list: Vec<String>) {
        self.whitelist = list
            .into_iter()
            .map(|d| d.trim().to_lowercase())
            .filter(|d| !d.is_empty())
            .collect();
    }

    pub fn is_whitelisted(&self, host: &str) -> bool {
        let clean = host.trim().to_lowercase();
        self.whitelist.iter().any(|w| clean == *w || clean.ends_with(&format!(".{}", w)))
    }

    pub fn is_domain_blocked(&self, host: &str) -> bool {
        let clean = host.trim().to_lowercase();
        self.blocked_domains.iter().any(|b| clean == *b || clean.ends_with(&format!(".{}", b)))
    }

    pub fn check_url(&self, url_str: &str) -> Option<BlockedTrackerItem> {
        if !self.enabled {
            return None;
        }

        if let Ok(parsed) = url::Url::parse(url_str) {
            if let Some(host) = parsed.host_str() {
                if self.is_whitelisted(host) {
                    return None;
                }

                if self.is_domain_blocked(host) {
                    return Some(BlockedTrackerItem {
                        url: url_str.to_string(),
                        domain: host.to_string(),
                        category: Some("Advertising & Analytics".to_string()),
                        rule: Some(format!("||{}^", host)),
                        timestamp: chrono::Utc::now().timestamp_millis(),
                    });
                }
            }
        }
        None
    }

    pub fn get_cosmetic_css(&self) -> &'static str {
        r#"
        .adsbygoogle, .ad-banner, .advertisement, [id^="google_ads_iframe"],
        div[class*="ad-container"], div[class*="ad_wrapper"], div[class*="taboola-"],
        div[class*="outbrain-"], .trc_related_container, .ad-slot,
        ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer,
        ytd-banner-promo-renderer, #player-ads, .video-ads, .ytp-ad-module {
            display: none !important;
            height: 0 !important;
            min-height: 0 !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
        "#
    }

    pub fn get_youtube_skipper_script(&self) -> &'static str {
        r#"
        (() => {
            if (window.__neutrino_yt_skipper_injected) return;
            window.__neutrino_yt_skipper_injected = true;

            const skipAd = () => {
                const video = document.querySelector('video');
                const adShowing = document.querySelector('.ad-showing, .ad-interrupting');
                if (adShowing && video && !isNaN(video.duration)) {
                    video.playbackRate = 16.0;
                    video.muted = true;
                    if (video.duration > 0 && video.currentTime < video.duration) {
                        video.currentTime = video.duration;
                    }
                }
                const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern');
                if (skipBtn) {
                    try { skipBtn.click(); } catch(e) {}
                }
            };

            setInterval(skipAd, 300);
        })();
        "#
    }
}

