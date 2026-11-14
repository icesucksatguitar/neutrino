fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let status = std::process::Command::new(r"C:\Users\simpl\AppData\Local\Microsoft\WinGet\Packages\MartinStorsjo.LLVM-MinGW.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\llvm-mingw-20261020-ucrt-x86_64\bin\windres.exe")
        .args(&args)
        .status()
        .expect("failed to execute windres");
    std::process::exit(status.code().unwrap_or(1));
}
