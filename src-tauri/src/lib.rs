mod commands;
mod models;

use commands::{
    create_markdown_file, inspect_text_file, read_file_snapshot, read_image_data_url, read_text_file,
    save_article_image, save_text_file_safely, scan_directory,
};

/// 创建并运行文染的 Tauri 应用。
///
/// 业务逻辑放在 `commands` 模块中，这里只负责插件初始化、命令注册和应用生命周期。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            save_text_file_safely
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // 主窗口关闭后结束后台进程，避免应用退出后仍然驻留。
                if window.label() == "main" {
                    std::process::exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running WenRender");
}
