use byteorder::{NativeEndian, ReadBytesExt, WriteBytesExt};
use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

use crate::filter::{FilterDecision, FilterEngine, ThreatCategory};
use crate::privacy::{FingerprintShield, TelemetryScrubber};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "action", content = "payload")]
pub enum RequestMessage {
    Ping,
    CheckUrl { url: String, tab_id: Option<u64> },
    CleanUrl { url: String },
    GetCanvasNoise { origin: String, x: u32, y: u32, channel: u8 },
    GetStats,
    UpdateRules { domain: String, block: bool },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShieldStats {
    pub total_inspected: u64,
    pub total_blocked: u64,
    pub trackers_blocked: u64,
    pub analytics_blocked: u64,
    pub ads_blocked: u64,
    pub active_rules_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "status", content = "data")]
pub enum ResponseMessage {
    Pong { timestamp: i64 },
    UrlChecked(FilterDecision),
    UrlCleaned { original: String, cleaned: String },
    CanvasNoise { delta: i8 },
    Stats(ShieldStats),
    RulesUpdated { domain: String, blocked: bool },
    Error { message: String },
}

pub struct NativeProtocol {
    filter: FilterEngine,
    fingerprint: FingerprintShield,
    scrubber: TelemetryScrubber,
    stats: ShieldStats,
}

impl Default for NativeProtocol {
    fn default() -> Self {
        let filter = FilterEngine::new();
        let active_rules = filter.total_rules_count();
        Self {
            filter,
            fingerprint: FingerprintShield::new(),
            scrubber: TelemetryScrubber::new(),
            stats: ShieldStats {
                total_inspected: 0,
                total_blocked: 0,
                trackers_blocked: 0,
                analytics_blocked: 0,
                ads_blocked: 0,
                active_rules_count: active_rules,
            },
        }
    }
}

impl NativeProtocol {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn handle_request(&mut self, request: RequestMessage) -> ResponseMessage {
        match request {
            RequestMessage::Ping => ResponseMessage::Pong {
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0),
            },
            RequestMessage::CheckUrl { url, .. } => {
                self.stats.total_inspected += 1;
                let decision = self.filter.evaluate_url(&url);

                if decision.blocked {
                    self.stats.total_blocked += 1;
                    match decision.category {
                        Some(ThreatCategory::Tracker) | Some(ThreatCategory::Fingerprinter) => {
                            self.stats.trackers_blocked += 1;
                        }
                        Some(ThreatCategory::Analytics) | Some(ThreatCategory::Telemetry) => {
                            self.stats.analytics_blocked += 1;
                        }
                        Some(ThreatCategory::Advertising) => {
                            self.stats.ads_blocked += 1;
                        }
                        _ => {}
                    }
                }

                ResponseMessage::UrlChecked(decision)
            }
            RequestMessage::CleanUrl { url } => {
                let cleaned = self.scrubber.clean_url_tracking_params(&url);
                ResponseMessage::UrlCleaned {
                    original: url,
                    cleaned,
                }
            }
            RequestMessage::GetCanvasNoise { origin, x, y, channel } => {
                let delta = self.fingerprint.calculate_canvas_delta(&origin, x, y, channel);
                ResponseMessage::CanvasNoise { delta }
            }
            RequestMessage::GetStats => {
                self.stats.active_rules_count = self.filter.total_rules_count();
                ResponseMessage::Stats(ShieldStats {
                    total_inspected: self.stats.total_inspected,
                    total_blocked: self.stats.total_blocked,
                    trackers_blocked: self.stats.trackers_blocked,
                    analytics_blocked: self.stats.analytics_blocked,
                    ads_blocked: self.stats.ads_blocked,
                    active_rules_count: self.stats.active_rules_count,
                })
            }
            RequestMessage::UpdateRules { domain, block } => {
                self.filter.add_custom_rule(&domain, block);
                self.stats.active_rules_count = self.filter.total_rules_count();
                ResponseMessage::RulesUpdated { domain, blocked: block }
            }
        }
    }

    /// Reads a 32-bit length-prefixed JSON message from the provided reader (stdin)
    pub fn read_message<R: Read>(reader: &mut R) -> io::Result<Option<RequestMessage>> {
        let length = match reader.read_u32::<NativeEndian>() {
            Ok(len) => len as usize,
            Err(ref e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
            Err(e) => return Err(e),
        };

        if length == 0 || length > 1024 * 1024 * 4 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Invalid message size: {} bytes", length),
            ));
        }

        let mut buffer = vec![0u8; length];
        reader.read_exact(&mut buffer)?;

        let request: RequestMessage = serde_json::from_slice(&buffer).map_err(|e| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("JSON deserialize error: {}", e),
            )
        })?;

        Ok(Some(request))
    }

    /// Writes a 32-bit length-prefixed JSON message to the provided writer (stdout)
    pub fn write_message<W: Write>(writer: &mut W, response: &ResponseMessage) -> io::Result<()> {
        let payload = serde_json::to_vec(response).map_err(|e| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("JSON serialize error: {}", e),
            )
        })?;

        writer.write_u32::<NativeEndian>(payload.len() as u32)?;
        writer.write_all(&payload)?;
        writer.flush()?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ipc_roundtrip() {
        let mut protocol = NativeProtocol::new();
        let resp = protocol.handle_request(RequestMessage::Ping);
        match resp {
            ResponseMessage::Pong { timestamp } => assert!(timestamp > 0),
            _ => panic!("Expected Pong"),
        }

        let check = protocol.handle_request(RequestMessage::CheckUrl {
            url: "https://www.google-analytics.com/ga.js".to_string(),
            tab_id: Some(1),
        });
        match check {
            ResponseMessage::UrlChecked(decision) => {
                assert!(decision.blocked);
            }
            _ => panic!("Expected UrlChecked"),
        }

        let stats = protocol.handle_request(RequestMessage::GetStats);
        match stats {
            ResponseMessage::Stats(s) => {
                assert_eq!(s.total_inspected, 1);
                assert_eq!(s.total_blocked, 1);
            }
            _ => panic!("Expected Stats"),
        }
    }
}
