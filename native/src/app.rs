use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::thread;
use std::time::Duration;

const VERSION: &str = "0.1.0";

fn print_banner() {
    println!("============================================================");
    println!("             NEUTRINO BROWSER - DESKTOP RUNNER              ");
    println!("  Engine: Firefox (Gecko) | Privacy: Rust | UI/UX: React JS ");
    println!("  Version: {}                                              ", VERSION);
    println!("============================================================");
}

fn find_ui_file() -> Option<PathBuf> {
    // 1. Next to current executable (in dist/neutrino-browser/)
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let dist_ui = exe_dir.join("ui").join("index.html");
            if dist_ui.exists() {
                return Some(dist_ui);
            }
            let parent_dist_ui = exe_dir.join("..").join("ui").join("index.html");
            if parent_dist_ui.exists() {
                return Some(parent_dist_ui);
            }
        }
    }

    // 2. In project workspace
    let candidates = [
        Path::new("dist").join("neutrino-browser").join("ui").join("index.html"),
        Path::new("ui").join("dist").join("index.html"),
    ];

    for path in &candidates {
        if path.exists() {
            return Some(path.to_path_buf());
        }
    }

    None
}

fn find_firefox_binary() -> Option<PathBuf> {
    let standard_paths = [
        r"C:\Program Files\Mozilla Firefox\firefox.exe",
        r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
    ];

    for path_str in &standard_paths {
        let p = PathBuf::from(path_str);
        if p.exists() {
            return Some(p);
        }
    }

    // Check LOCALAPPDATA
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        let p = PathBuf::from(local_app_data).join("Mozilla Firefox").join("firefox.exe");
        if p.exists() {
            return Some(p);
        }
    }

    // Check custom engine runtime directory
    let custom_runtime = Path::new("engine").join("runtime").join("firefox.exe");
    if custom_runtime.exists() {
        return Some(custom_runtime);
    }

    None
}

fn setup_profile_dir() -> PathBuf {
    let mut profile_dir = PathBuf::from("engine").join("profiles").join("active");
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let dist_profile = exe_dir.join("engine").join("profiles").join("active");
            if dist_profile.exists() || exe_dir.join("engine").join("config").exists() {
                profile_dir = dist_profile;
            }
        }
    }

    let _ = fs::create_dir_all(&profile_dir);

    // Copy user.js if config exists
    let user_js_candidates = [
        PathBuf::from("engine").join("config").join("user.js"),
        profile_dir.join("..").join("..").join("config").join("user.js"),
    ];

    for candidate in &user_js_candidates {
        if candidate.exists() {
            let dest = profile_dir.join("user.js");
            let _ = fs::copy(candidate, dest);
            break;
        }
    }

    profile_dir
}

fn spawn_native_host() -> Option<Child> {
    let host_candidates = [
        PathBuf::from("bin").join("neutrino-host.exe"),
        PathBuf::from("native").join("target").join("release").join("neutrino-host.exe"),
        PathBuf::from("neutrino-host.exe"),
    ];

    for candidate in &host_candidates {
        if candidate.exists() {
            println!("[Neutrino] Starting Rust native privacy engine: {}", candidate.display());
            match Command::new(candidate).spawn() {
                Ok(child) => return Some(child),
                Err(e) => eprintln!("[Neutrino Warning] Failed to start native host {}: {}", candidate.display(), e),
            }
        }
    }

    None
}

fn launch_app_window(target_url: &str) {
    println!("[Neutrino] Opening desktop browser window: {}", target_url);

    // 1. Try launching with modern Chromium/Edge app-mode for windowed frameless desktop UI
    let app_flag = format!("--app={}", target_url);
    let app_mode_cmd = Command::new("msedge.exe")
        .arg(&app_flag)
        .arg("--disable-features=Translate")
        .spawn();

    if app_mode_cmd.is_ok() {
        println!("[Neutrino] Running in dedicated standalone window mode.");
        return;
    }

    // 2. Fallback to start / explorer default
    let _ = Command::new("cmd")
        .args(["/c", "start", "", target_url])
        .spawn();
}

fn main() {
    print_banner();

    let args: Vec<String> = env::args().collect();
    if args.iter().any(|a| a == "--version" || a == "-v") {
        println!("Neutrino Browser v{}", VERSION);
        return;
    }

    let is_dev = args.iter().any(|a| a == "--dev");

    // 1. Determine target URL
    let target_url = if is_dev {
        "http://localhost:3000".to_string()
    } else if let Some(ui_file) = find_ui_file() {
        let abs = fs::canonicalize(&ui_file).unwrap_or(ui_file);
        let clean = abs.to_string_lossy().replace(r"\\?\", "").replace('\\', "/");
        format!("file:///{}", clean)
    } else {
        "https://duckduckgo.com".to_string()
    };

    // 2. Setup hardened profile
    let profile_dir = setup_profile_dir();
    println!("[Neutrino] Isolated profile directory: {}", profile_dir.display());

    // 3. Start native host supervisor
    let mut native_host = spawn_native_host();

    // 4. Check for Firefox binary
    let firefox_bin = find_firefox_binary();

    if let Some(ff_path) = firefox_bin {
        println!("[Neutrino] Found Firefox Gecko Engine at: {}", ff_path.display());
        println!("[Neutrino] Launching hardened Gecko session...");

        let mut cmd = Command::new(ff_path);
        cmd.arg("-no-remote")
            .arg("-profile")
            .arg(&profile_dir)
            .arg(&target_url);

        match cmd.spawn() {
            Ok(mut child) => {
                println!("[Neutrino] Hardened browser session active (PID: {}).", child.id());
                let _ = child.wait();
            }
            Err(e) => {
                eprintln!("[Neutrino Error] Failed to launch Firefox: {}", e);
                launch_app_window(&target_url);
            }
        }
    } else {
        println!("[Neutrino Info] Firefox binary not in standard location.");
        println!("[Neutrino] Launching desktop application window with React UI & Rust privacy core...");
        launch_app_window(&target_url);
    }

    // Keep native host alive while running
    if let Some(mut host) = native_host.take() {
        thread::sleep(Duration::from_millis(500));
        let _ = host.kill();
    }

    println!("[Neutrino] Browser session terminated.");
}
