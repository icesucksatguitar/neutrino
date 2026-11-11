use neutrino_native::FastFilterEngine;
use std::io::{self, BufRead, Read};

/// Entry point for the `neutrino-core` native helper.
///
/// Modes:
///   (no arguments)              Legacy stdin URL-checker line protocol (unchanged default).
///   verify --hwnd <n> --reason <text>
///                               Windows Hello / Windows sign-in user verification parented
///                               to Neutrino's window. Prints a JSON result to stdout.
///   dpapi-unprotect             Reads base64 from stdin, runs DPAPI CryptUnprotectData, and
///                               prints the unprotected bytes (base64) as JSON. Used to unwrap
///                               the Chrome/Edge `os_crypt` key.
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("verify") => run_verify(&args[1..]),
        Some("dpapi-unprotect") => run_dpapi_unprotect(),
        _ => run_stdin_filter(),
    }
}

/// Legacy no-argument mode: evaluate URLs read from stdin, one per line.
fn run_stdin_filter() {
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

/// Parse a flag of the form `--name value` from an argument slice.
fn parse_flag(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

/// Emit a verify result as JSON and exit. `result` is one of
/// verified | cancelled | failed | unavailable.
fn print_verify(result: &str, message: Option<&str>) {
    let out = serde_json::json!({
        "result": result,
        "message": message,
    });
    println!("{}", out);
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

#[cfg(windows)]
fn run_verify(args: &[String]) {
    use windows::core::HSTRING;
    use windows::Foundation::IAsyncOperation;
    use windows::Security::Credentials::UI::{
        UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
    };
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::IUserConsentVerifierInterop;

    let hwnd_raw: isize = match parse_flag(args, "--hwnd").and_then(|v| v.parse::<isize>().ok()) {
        Some(h) => h,
        None => {
            print_verify("failed", Some("missing or invalid --hwnd"));
            return;
        }
    };
    let reason = parse_flag(args, "--reason")
        .unwrap_or_else(|| "Verify your identity".to_string());

    // Confirm that Windows Hello / Windows sign-in is available before prompting.
    match UserConsentVerifier::CheckAvailabilityAsync().and_then(|op| op.get()) {
        Ok(UserConsentVerifierAvailability::Available) => {}
        Ok(_) => {
            print_verify("unavailable", Some("Windows Hello is not available"));
            return;
        }
        Err(e) => {
            print_verify("unavailable", Some(&format!("availability check failed: {e}")));
            return;
        }
    }

    // A console helper owns no window, so parent the Hello dialog to Neutrino's HWND
    // through the interop interface rather than the windowless RequestVerificationAsync.
    let hwnd = HWND(hwnd_raw as *mut core::ffi::c_void);
    let message = HSTRING::from(reason);

    let interop: IUserConsentVerifierInterop =
        match windows::core::factory::<UserConsentVerifier, IUserConsentVerifierInterop>() {
            Ok(i) => i,
            Err(e) => {
                print_verify("unavailable", Some(&format!("interop unavailable: {e}")));
                return;
            }
        };

    let op: IAsyncOperation<UserConsentVerificationResult> = match unsafe {
        interop.RequestVerificationForWindowAsync(hwnd, &message)
    } {
        Ok(op) => op,
        Err(e) => {
            print_verify("failed", Some(&format!("request failed: {e}")));
            return;
        }
    };

    match op.get() {
        Ok(UserConsentVerificationResult::Verified) => print_verify("verified", None),
        Ok(UserConsentVerificationResult::Canceled) => print_verify("cancelled", None),
        Ok(other) => print_verify("failed", Some(&format!("verification result: {:?}", other.0))),
        Err(e) => print_verify("failed", Some(&format!("verification failed: {e}"))),
    }
}

#[cfg(not(windows))]
fn run_verify(_args: &[String]) {
    print_verify("unavailable", Some("Windows Hello is only available on Windows"));
}

// ---------------------------------------------------------------------------
// dpapi-unprotect
// ---------------------------------------------------------------------------

/// Read all of stdin as a base64 string (whitespace tolerated).
fn read_stdin_base64() -> Result<Vec<u8>, String> {
    use base64::Engine as _;
    let mut raw = String::new();
    io::stdin()
        .read_to_string(&mut raw)
        .map_err(|e| format!("failed to read stdin: {e}"))?;
    let trimmed: String = raw.split_whitespace().collect();
    base64::engine::general_purpose::STANDARD
        .decode(trimmed.as_bytes())
        .map_err(|e| format!("invalid base64 input: {e}"))
}

fn print_dpapi_error(message: &str) {
    let out = serde_json::json!({
        "result": "error",
        "message": message,
    });
    println!("{}", out);
}

#[cfg(windows)]
fn run_dpapi_unprotect() {
    use base64::Engine as _;
    use windows::Win32::Foundation::LocalFree;
    use windows::Win32::Foundation::HLOCAL;
    use windows::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};

    let input = match read_stdin_base64() {
        Ok(bytes) => bytes,
        Err(e) => {
            print_dpapi_error(&e);
            return;
        }
    };

    let mut in_blob = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();

    let ok = unsafe {
        CryptUnprotectData(
            &mut in_blob,
            None,
            None,
            None,
            None,
            0,
            &mut out_blob,
        )
    };

    match ok {
        Ok(()) => {
            let slice = unsafe {
                std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize)
            };
            let encoded = base64::engine::general_purpose::STANDARD.encode(slice);
            if !out_blob.pbData.is_null() {
                unsafe {
                    let _ = LocalFree(HLOCAL(out_blob.pbData as *mut core::ffi::c_void));
                }
            }
            let out = serde_json::json!({
                "result": "ok",
                "data": encoded,
            });
            println!("{}", out);
        }
        Err(e) => print_dpapi_error(&format!("CryptUnprotectData failed: {e}")),
    }
}

#[cfg(not(windows))]
fn run_dpapi_unprotect() {
    print_dpapi_error("DPAPI is only available on Windows");
}
