fn main() {
    // Explicit app command manifest makes the capability allowlist meaningful.
    let attrs = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["upload_mesh", "slice_mesh"]),
    );
    tauri_build::try_build(attrs).expect("Tauri build configuration");
}
