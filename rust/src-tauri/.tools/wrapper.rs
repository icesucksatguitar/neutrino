fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();

    // Check if -S is already provided
    let has_as = args.iter().any(|a| a == "-S" || a == "--as");
    if !has_as {
        args.push("-S".to_string());
        args.push(r"C:\Users\simpl\OneDrive\Desktop\neutrino\rust\src-tauri\.tools\as.exe".to_string());
    }

    let status = std::process::Command::new(r"C:\Users\simpl\.rustup\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained\dlltool.exe")
        .args(&args)
        .status()
        .expect("failed to execute GNU dlltool");

    std::process::exit(status.code().unwrap_or(1));
}
