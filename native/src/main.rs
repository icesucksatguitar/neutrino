use neutrino_native::FastFilterEngine;
use std::io::{self, BufRead};

fn main() {
    let engine = FastFilterEngine::new();
    let count = engine.count_rules();
    println!("[Neutrino Native Core] Initialized with {} threat rules.", count);

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        if let Ok(url) = line {
            let trimmed = url.trim();
            if trimmed.is_empty() {
                continue;
            }
            if trimmed == "exit" || trimmed == "quit" {
                break;
            }
            let decision = engine.check_url(trimmed);
            let cleaned = engine.clean_url(trimmed);
            let output = serde_json::json!({
                "url": trimmed,
                "cleaned": cleaned,
                "blocked": decision.blocked,
                "category": decision.category,
                "rule": decision.rule
            });
            println!("{}", output);
        }
    }
}
