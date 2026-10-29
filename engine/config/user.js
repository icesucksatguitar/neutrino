// =============================================================================
// NEUTRINO BROWSER - HARDENED USER.JS PREFERENCES
// Core Engine Privacy & Fingerprinting Resistance Configuration
// =============================================================================

// --- Section 1: Telemetry & Mozilla Data Harvesting Neutralization ---
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.enabled", false);
user_pref("toolkit.telemetry.unified", false);
user_pref("toolkit.telemetry.server", "data:,");
user_pref("toolkit.telemetry.archive.enabled", false);
user_pref("toolkit.telemetry.newProfilePing.enabled", false);
user_pref("toolkit.telemetry.shutdownPingSender.enabled", false);
user_pref("toolkit.telemetry.updatePing.enabled", false);
user_pref("toolkit.telemetry.bhrPing.enabled", false);
user_pref("toolkit.telemetry.firstShutdownPing.enabled", false);
user_pref("toolkit.telemetry.coverage.opt-out", true);
user_pref("toolkit.coverage.opt-out", true);
user_pref("toolkit.coverage.endpoint.base", "");
user_pref("experiments.supported", false);
user_pref("experiments.enabled", false);
user_pref("experiments.manifest.uri", "");
user_pref("app.normandy.enabled", false);
user_pref("app.normandy.api_url", "");
user_pref("app.shield.optoutstudies.enabled", false);

// --- Section 2: Fingerprinting & Device Enumeration Defenses ---
user_pref("privacy.resistFingerprinting", true);
user_pref("privacy.resistFingerprinting.block_mozAddonManager", true);
user_pref("privacy.resistFingerprinting.letterboxing", false); // Keep custom UI responsive
user_pref("dom.battery.enabled", false);
user_pref("dom.gamepad.enabled", false);
user_pref("dom.netinfo.enabled", false);
user_pref("dom.vibrator.enabled", false);
user_pref("media.navigator.enabled", false);
user_pref("canvas.capturestream.enabled", false);

// --- Section 3: WebRTC & Network Leak Prevention ---
user_pref("media.peerconnection.enabled", false); // Prevents local/public IP leak through STUN/TURN
user_pref("media.peerconnection.ice.no_host", true);
user_pref("media.peerconnection.ice.default_address_only", true);
user_pref("network.dns.disablePrefetch", true);
user_pref("network.prefetch-next", false);
user_pref("network.http.speculative-parallel-limit", 0);

// --- Section 4: Total Cookie Protection & State Partitioning ---
user_pref("network.cookie.cookieBehavior", 5); // dFPI / Total Cookie Protection (cross-site isolation)
user_pref("privacy.partition.network_state", true);
user_pref("privacy.partition.serviceWorkers", true);
user_pref("privacy.firstparty.isolate", false); // Handled dynamically by dFPI

// --- Section 5: Tracking Protection & Cryptomining ---
user_pref("privacy.trackingprotection.enabled", true);
user_pref("privacy.trackingprotection.pbmode.enabled", true);
user_pref("privacy.trackingprotection.cryptomining.enabled", true);
user_pref("privacy.trackingprotection.fingerprinting.enabled", true);
user_pref("privacy.trackingprotection.socialtracking.enabled", true);

// --- Section 6: DNS-over-HTTPS (DoH) ---
user_pref("network.trr.mode", 2); // 2 = DoH with native fallback
user_pref("network.trr.uri", "https://cloudflare-dns.com/dns-query");
user_pref("network.trr.custom_uri", "https://cloudflare-dns.com/dns-query");

// --- Section 7: UI & Custom Chrome Integration ---
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.compactmode.show", true);
user_pref("browser.uidensity", 1);
user_pref("browser.newtabpage.enabled", false);
user_pref("browser.startup.page", 3); // Restore previous session

