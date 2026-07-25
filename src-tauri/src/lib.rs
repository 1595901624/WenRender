use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownFile {
    path: String,
    content: String,
}

#[tauri::command]
fn scan_markdown_directory(directory_path: String) -> Result<Vec<MarkdownFile>, String> {
    let root = PathBuf::from(directory_path);
    if !root.is_dir() {
        return Err("所选路径不是目录".to_string());
    }

    let mut files = Vec::new();
    collect_markdown_files(&root, &mut files)?;
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

fn collect_markdown_files(directory: &Path, files: &mut Vec<MarkdownFile>) -> Result<(), String> {
    let entries = std::fs::read_dir(directory)
        .map_err(|error| format!("无法读取目录 {}：{error}", directory.display()))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with('.') || matches!(name.as_ref(), "node_modules" | "target" | "dist")
            {
                continue;
            }
            // 子目录可能受系统权限限制；跳过它们不应阻止其余文章被打开。
            let _ = collect_markdown_files(&path, files);
            continue;
        }

        if !file_type.is_file() || !is_markdown_file(&path) {
            continue;
        }

        if let Ok(content) = std::fs::read_to_string(&path) {
            files.push(MarkdownFile {
                path: path.to_string_lossy().into_owned(),
                content,
            });
        }
    }
    Ok(())
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown"
            )
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![scan_markdown_directory])
        .run(tauri::generate_context!())
        .expect("error while running WenRender");
}
