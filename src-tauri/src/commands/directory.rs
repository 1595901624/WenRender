use std::fs;
use std::path::{Path, PathBuf};

use crate::models::{DirectoryNode, DirectoryTree};

/// 扫描用户选择的目录并生成前端侧边栏使用的目录树。
#[tauri::command]
pub(crate) fn scan_directory(directory_path: String) -> Result<DirectoryTree, String> {
    // 目录选择结果由前端持久化，应用重启后会再次扫描，以反映磁盘上的最新状态。
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

/// 递归收集目录内容，并按照“目录优先、名称排序”的规则返回节点。
fn collect_directory_entries(directory: &Path) -> Result<Vec<DirectoryNode>, String> {
    let entries = fs::read_dir(directory)
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
            // 隐藏目录及生成目录通常内容庞大，不应拖慢工作区的首次加载。
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
                // 单个无权限目录不应导致整个项目打开失败，因此将其显示为空目录。
                children: collect_directory_entries(&path).unwrap_or_default(),
            });
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let is_markdown = is_markdown_file(&path);
        // 只有 Markdown 文件需要预读内容，其他文件仅用于“显示所有文件”模式。
        let content = is_markdown
            .then(|| fs::read_to_string(&path).ok())
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

/// 判断文件扩展名是否属于软件支持的 Markdown 格式。
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
