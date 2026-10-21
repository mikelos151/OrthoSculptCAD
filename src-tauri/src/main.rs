#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod state;
mod self_test;
mod navigation;
use state::{NativeState,UploadSummary};
#[tauri::command]
fn upload_mesh(request:tauri::ipc::Request<'_>,state:tauri::State<'_,NativeState>)->Result<UploadSummary,String> {
    let tauri::ipc::InvokeBody::Raw(bytes)=request.body() else {return Err("expected raw binary mesh packet".into());};
    state.upload(bytes)
}
#[tauri::command]
fn slice_mesh(z:f64,generation:Option<u64>,state:tauri::State<'_,NativeState>)->Result<tauri::ipc::Response,String> {
    state.slice(z,generation).map(tauri::ipc::Response::new)
}
fn main() {
    // OS command-line only. No filesystem primitive is exposed through IPC.
    let args:Vec<_>=std::env::args_os().skip(1).collect();
    if args.first().is_some_and(|s|s=="--self-test") {
        let result=(||->Result<(),String> {
            use std::io::Write;
            if args.len()!=2 {return Err("usage: orthosculpt-cad --self-test <new-report-path>".into());}
            let report=self_test::report()?;
            let bytes=serde_json::to_vec_pretty(&report).map_err(|_|"smoke JSON serialization failed")?;
            let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&args[1]).map_err(|_|"cannot create new smoke report; choose an unused path")?;
            file.write_all(&bytes).map_err(|_|"cannot write smoke report")?;
            file.sync_all().map_err(|_|"cannot flush smoke report")?;
            Ok(())
        })();
        if let Err(e)=result {eprintln!("{e}");std::process::exit(1);}
        return;
    }
    tauri::Builder::default()
        .setup(|app| {
            let config=app.config().app.windows.first().ok_or("missing main window config")?;
            tauri::WebviewWindowBuilder::from_config(app,config)?
                .on_navigation(|url| {
                    url.username().is_empty() && url.password().is_none()
                        && navigation::local_origin(url.scheme(),url.host_str(),url.port(),cfg!(debug_assertions))
                })
                .on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .manage(NativeState::default())
        .invoke_handler(tauri::generate_handler![upload_mesh,slice_mesh])
        .run(tauri::generate_context!())
        .expect("OrthoSculpt native runtime error");
}
