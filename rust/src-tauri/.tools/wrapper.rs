use std::path::{Path, PathBuf};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let mut dll_name: Option<String> = None;
    let mut out_lib: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        if args[i] == "-D" && i + 1 < args.len() {
            dll_name = Some(args[i + 1].clone());
            i += 2;
        } else if args[i] == "-l" && i + 1 < args.len() {
            out_lib = Some(args[i + 1].clone());
            i += 2;
        } else {
            i += 1;
        }
    }

    let sys_dir = Path::new(r"C:\Users\simpl\.rustup\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\lib\self-contained");

    if let (Some(dll), Some(out)) = (dll_name, out_lib) {
        let base_name = dll.trim_end_matches(".dll").to_lowercase();
        
        let candidate = if base_name == "api-ms-win-core-synch-l1-2-0" {
            Some(sys_dir.join("libsynchronization.a"))
        } else {
            let direct = sys_dir.join(format!("lib{}.a", base_name));
            if direct.exists() {
                Some(direct)
            } else {
                None
            }
        };

        if let Some(src_lib) = candidate {
            if src_lib.exists() {
                if let Ok(_) = std::fs::copy(&src_lib, &out) {
                    std::process::exit(0);
                }
            }
        }
    }

    let status = std::process::Command::new(r"C:\Users\simpl\AppData\Local\Microsoft\WinGet\Packages\MartinStorsjo.LLVM-MinGW.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\llvm-mingw-20261020-ucrt-x86_64\bin\llvm-dlltool.exe")
        .args(&args)
        .status()
        .expect("failed to execute llvm-dlltool");
    std::process::exit(status.code().unwrap_or(1));
}
