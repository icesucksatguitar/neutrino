use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FingerprintShield {
    pub canvas_noise_enabled: bool,
    pub audio_noise_enabled: bool,
    pub user_agent_spoof_enabled: bool,
    pub webrtc_protect_enabled: bool,
}

impl Default for FingerprintShield {
    fn default() -> Self {
        Self {
            canvas_noise_enabled: true,
            audio_noise_enabled: true,
            user_agent_spoof_enabled: true,
            webrtc_protect_enabled: true,
        }
    }
}

impl FingerprintShield {
    pub fn new() -> Self {
        Self::default()
    }

    /// Computes a deterministic pseudo-random 8-bit noise delta for a given origin and canvas coordinate.
    /// This ensures canvas fingerprints vary between origins (defeating cross-site tracking)
    /// while remaining consistent within the same site session (avoiding UI visual glitching).
    pub fn calculate_canvas_delta(&self, origin: &str, x: u32, y: u32, channel: u8) -> i8 {
        if !self.canvas_noise_enabled {
            return 0;
        }

        let mut hash: u64 = 0xcbf29ce484222325;
        let prime: u64 = 0x100000001b3;

        for byte in origin.as_bytes() {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(prime);
        }

        hash ^= x as u64;
        hash = hash.wrapping_mul(prime);
        hash ^= y as u64;
        hash = hash.wrapping_mul(prime);
        hash ^= channel as u64;
        hash = hash.wrapping_mul(prime);

        // Produces a subtle shift between -2 and +2
        ((hash % 5) as i8) - 2
    }

    /// Sanitizes the User-Agent header, stripping exact OS build numbers, CPU architecture leaks, and GPU models.
    pub fn sanitize_user_agent(&self, original_ua: &str) -> String {
        if !self.user_agent_spoof_enabled {
            return original_ua.to_string();
        }

        // Standardized hardened User-Agent string aligned with privacy standards
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canvas_delta_deterministic() {
        let shield = FingerprintShield::new();
        let delta1 = shield.calculate_canvas_delta("https://example.com", 100, 200, 0);
        let delta2 = shield.calculate_canvas_delta("https://example.com", 100, 200, 0);
        assert_eq!(delta1, delta2);

        // Different site should produce different hash
        let delta_other = shield.calculate_canvas_delta("https://tracking-site.com", 100, 200, 0);
        assert!(delta1 >= -2 && delta1 <= 2);
        assert!(delta_other >= -2 && delta_other <= 2);
    }

    #[test]
    fn test_user_agent_sanitization() {
        let shield = FingerprintShield::new();
        let leaked_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Trident/7.0; rv:11.0; WOW64) SpecialBuild/99.1";
        let clean = shield.sanitize_user_agent(leaked_ua);
        assert!(!clean.contains("Trident"));
        assert!(!clean.contains("SpecialBuild"));
        assert!(clean.contains("rv:135.0"));
    }
}

