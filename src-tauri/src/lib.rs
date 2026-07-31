mod commands;
mod models;

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::Mutex,
};

use commands::{
    create_markdown_file, delete_image_host_secrets, delete_wechat_account_secret,
    get_image_host_secret_status, get_wechat_account_secret_status, inspect_text_file,
    move_file_to_trash, read_file_snapshot, read_image_data_url, read_text_file, rename_file,
    save_article_image, save_image_host_secrets, save_text_file_safely, save_wechat_account_secret,
    scan_directory, sync_wechat_draft, test_wechat_account, upload_image_to_host,
};
use tauri::{Emitter, Manager};

const OPEN_MARKDOWN_EVENT: &str = "markdown-files-open-requested";

#[derive(Default)]
struct PendingOpenFiles(Mutex<Vec<String>>);

#[tauri::command]
fn take_pending_open_files(state: tauri::State<'_, PendingOpenFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().expect("pending open files lock poisoned"))
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown" | "mkd"
            )
        })
}

fn markdown_paths_from_args<I>(args: I, cwd: &Path) -> Vec<String>
where
    I: IntoIterator<Item = String>,
{
    args.into_iter()
        .filter_map(|argument| {
            let path = PathBuf::from(argument);
            let path = if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            };
            if !path.is_file() || !is_markdown_path(&path) {
                return None;
            }
            // 保留系统传入的普通绝对路径；Windows canonicalize 会产生 \\?\ 前缀，
            // 与文件选择器返回的路径形式不同，容易导致同一文件被重复打开。
            Some(path.to_string_lossy().into_owned())
        })
        .collect()
}

fn enqueue_open_files(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    let state = app.state::<PendingOpenFiles>();
    let mut pending = state.0.lock().expect("pending open files lock poisoned");
    let mut known = pending.iter().cloned().collect::<HashSet<_>>();
    for path in paths {
        if known.insert(path.clone()) {
            pending.push(path);
        }
    }
    drop(pending);
    // 前端未完成加载时事件可能无人接收，因此路径同时保留在队列中，前端会主动拉取。
    let _ = app.emit(OPEN_MARKDOWN_EVENT, ());
}

/// 创建并运行文染的 Tauri 应用。
///
/// 业务逻辑放在 `commands` 模块中，这里只负责插件初始化、命令注册和应用生命周期。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        enqueue_open_files(app, markdown_paths_from_args(args, Path::new(&cwd)));
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    let app = builder
        .manage(PendingOpenFiles::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            read_text_file,
            read_file_snapshot,
            create_markdown_file,
            read_image_data_url,
            save_article_image,
            inspect_text_file,
            save_text_file_safely,
            rename_file,
            move_file_to_trash,
            save_image_host_secrets,
            get_image_host_secret_status,
            delete_image_host_secrets,
            upload_image_to_host,
            save_wechat_account_secret,
            get_wechat_account_secret_status,
            delete_wechat_account_secret,
            test_wechat_account,
            sync_wechat_draft,
            take_pending_open_files
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // 主窗口关闭后结束后台进程，避免应用退出后仍然驻留。
                if window.label() == "main" {
                    std::process::exit(0);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building WenRender");

    let startup_cwd = std::env::current_dir().unwrap_or_default();
    enqueue_open_files(
        app.handle(),
        markdown_paths_from_args(
            std::env::args_os()
                .skip(1)
                .map(|argument| argument.to_string_lossy().into_owned()),
            &startup_cwd,
        ),
    );

    app.run(|_app_handle, _event| {
        // Finder 会通过应用生命周期事件交付文件 URL，而不是普通命令行参数。
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .filter(|path| path.is_file() && is_markdown_path(path))
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            enqueue_open_files(_app_handle, paths);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::is_markdown_path;
    use std::path::Path;

    #[test]
    fn recognizes_supported_markdown_extensions_case_insensitively() {
        for path in [
            "article.md",
            "article.MARKDOWN",
            "article.mdown",
            "article.MkD",
        ] {
            assert!(is_markdown_path(Path::new(path)));
        }
        assert!(!is_markdown_path(Path::new("article.txt")));
    }
}
