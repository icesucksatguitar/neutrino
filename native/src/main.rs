use std::io::{self, BufReader, BufWriter};
use neutrino_core::ipc::protocol::NativeProtocol;

fn main() -> io::Result<()> {
    // Set standard I/O for Mozilla Native Messaging protocol
    let stdin = io::stdin();
    let stdout = io::stdout();

    let mut reader = BufReader::new(stdin.lock());
    let mut writer = BufWriter::new(stdout.lock());

    let mut protocol = NativeProtocol::new();

    // Main event loop processing length-prefixed messages from Firefox / UI
    while let Ok(Some(request)) = NativeProtocol::read_message(&mut reader) {
        let response = protocol.handle_request(request);
        if let Err(e) = NativeProtocol::write_message(&mut writer, &response) {
            eprintln!("[Neutrino Host Error] Failed to write response: {}", e);
            break;
        }
    }

    Ok(())
}

