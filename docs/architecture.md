# Neutrino Architecture Notes

This document outlines the high-level technical direction and initial research questions for the project.

---

## 1. Status

* **Status:** Initial Research & Planning
* **Implementation State:** Unimplemented

No browser engine, native backend, or user interface code has been built or integrated yet.

---

## 2. Planned Technologies

* **Rendering Engine:** Mozilla Firefox / Gecko
* **User Interface:** TypeScript, HTML, CSS
* **Native Systems Layer:** Rust (for security-sensitive operations and system integration)
* **AI Capabilities:** Google Gemini (future integration)

---

## 3. Architecture & Integration Research

The exact method for integrating with Firefox/Gecko has not yet been selected or implemented and must be thoroughly researched before development begins.

Key research areas to evaluate:
1. **Mozilla Platform Customization:**
   - Building directly against the Mozilla Firefox source tree (`mozilla-central` / Firefox ESR) vs. custom distribution packaging.
   - Viability of desktop Gecko embedding options on target operating systems.
2. **TypeScript & Firefox Chrome Integration:**
   - How TypeScript compiles into the browser chrome runtime, WebComponents, or system extensions.
3. **Rust Systems Boundary:**
   - Establishing a secure, well-defined interface (such as Native Messaging or IPC) between the browser chrome and native Rust services.
4. **Security & Isolation:**
   - Ensuring complete separation between untrusted webpage JavaScript, the browser chrome, and native system capabilities.
