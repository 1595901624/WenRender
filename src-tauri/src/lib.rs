use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryNode {
    path: String,
    name: String,
    is_directory: bool,
    is_markdown: bool,
    content: Option<String>,
    children: Vec<DirectoryNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryTree {
    path: String,
    name: String,
    children: Vec<DirectoryNode>,
}

#[tauri::command]
fn scan_directory(directory_path: String) -> Result<DirectoryTree, String> {
    let root = PathBuf::from(directory_path);
    if !root.is_dir() {
        return Err("所选路径不是目录".to_string());
    }

    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| root.display().to_string());

    Ok(DirectoryTree {
        path: root.to_string_lossy().into_owned(),
        name,
        children: collect_directory_entries(&root)?,
    })
}

fn collect_directory_entries(directory: &Path) -> Result<Vec<DirectoryNode>, String> {
    let entries = std::fs::read_dir(directory)
        .map_err(|error| format!("无法读取目录 {}：{error}", directory.display()))?;
    let mut nodes = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || matches!(name.as_str(), "node_modules" | "target" | "dist")
            {
                continue;
            }
            nodes.push(DirectoryNode {
                path: path.to_string_lossy().into_owned(),
                name,
                is_directory: true,
                is_markdown: false,
                content: None,
                // 无权限的子目录显示为空，不阻止其余目录树加载。
                children: collect_directory_entries(&path).unwrap_or_default(),
            });
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let is_markdown = is_markdown_file(&path);
        let content = is_markdown
            .then(|| std::fs::read_to_string(&path).ok())
            .flatten();
        nodes.push(DirectoryNode {
            path: path.to_string_lossy().into_owned(),
            name: entry.file_name().to_string_lossy().into_owned(),
            is_directory: false,
            is_markdown,
            content,
            children: Vec::new(),
        });
    }

    nodes.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(nodes)
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
        .invoke_handler(tauri::generate_handler![scan_directory])
        .run(tauri::generate_context!())
        .expect("error while running WenRender");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_markdown_regular_files_and_directories() {
        let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("workspace root")
            .to_path_buf();
        let tree = scan_directory(workspace.to_string_lossy().into_owned()).expect("scan tree");

        let readme = tree
            .children
            .iter()
            .find(|node| node.name == "README.md")
            .expect("README.md");
        assert!(readme.is_markdown);
        assert!(readme.content.is_some());

        let package = tree
            .children
            .iter()
            .find(|node| node.name == "package.json")
            .expect("package.json");
        assert!(!package.is_markdown);
        assert!(package.content.is_none());

        assert!(tree
            .children
            .iter()
            .any(|node| node.name == "src" && node.is_directory));
    }
}
