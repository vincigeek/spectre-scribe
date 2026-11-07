# Tech steering

- Native macOS app only. Target macOS 14 (Sonoma) or later.
- Language: Swift. UI framework: SwiftUI.
- Style analysis and pipeline orchestration run in-process; no embedded web server.
- Keep the app small and runnable locally first (`swift build` or Xcode).
- All Kiro configuration lives under /.kiro at the repo root and must not be gitignored.
