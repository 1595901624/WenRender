use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileFingerprint {
    size: u64,
    modified_ms: u64,
    hash: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileSnapshot {
    content: String,
    fingerprint: FileFingerprint,
    line_ending: String,
    has_bom: bool,
    read_only: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileInspection {
    exists: bool,
    fingerprint: Option<FileFingerprint>,
    read_only: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveOutcome {
    status: String,
    reason: Option<String>,
    snapshot: Option<FileSnapshot>,
}

#[tauri::command]
fn scan_directory(directory_path: String) -> Result<DirectoryTree, String> {
    // 目录选择结果由前端持久化，重启时会再次调用本命令构建最新目录树。
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

#[tauri::command]
fn read_text_file(file_path: String) -> Result<String, String> {
    // 文件对话框的 WebView 授权不会跨重启保留，此命令用于恢复用户明确打开过的文件。
    let path = PathBuf::from(file_path);
    if !path.is_file() {
        return Err("所选路径不是文件".to_string());
    }
    std::fs::read_to_string(&path)
        .map_err(|error| format!("无法读取文件 {}：{error}", path.display()))
}

#[tauri::command]
fn read_file_snapshot(file_path: String) -> Result<FileSnapshot, String> {
    let path = PathBuf::from(file_path);
    read_snapshot(&path)
}

#[tauri::command]
fn inspect_text_file(file_path: String) -> Result<FileInspection, String> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Ok(FileInspection {
            exists: false,
            fingerprint: None,
            read_only: false,
        });
    }
    if !path.is_file() {
        return Err(format!("路径不是普通文件：{}", path.display()));
    }

    let bytes =
        fs::read(&path).map_err(|error| format!("无法检查文件 {}：{error}", path.display()))?;
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("无法读取文件信息 {}：{error}", path.display()))?;
    Ok(FileInspection {
        exists: true,
        fingerprint: Some(fingerprint(&bytes, &metadata)),
        read_only: metadata.permissions().readonly(),
    })
}

#[tauri::command]
fn save_text_file_safely(
    file_path: String,
    content: String,
    line_ending: String,
    has_bom: bool,
    expected_hash: Option<String>,
    force: bool,
    allow_create: bool,
) -> Result<SaveOutcome, String> {
    let path = PathBuf::from(file_path);
    let existing = path.is_file();

    if !existing && !allow_create {
        return Ok(SaveOutcome {
            status: "conflict".to_string(),
            reason: Some("deleted".to_string()),
            snapshot: None,
        });
    }

    if existing {
        let current = read_snapshot(&path)?;
        if current.read_only {
            return Err(format!("文件为只读，无法保存：{}", path.display()));
        }
        if !force
            && expected_hash
                .as_ref()
                .is_some_and(|expected| expected != &current.fingerprint.hash)
        {
            return Ok(SaveOutcome {
                status: "conflict".to_string(),
                reason: Some("modified".to_string()),
                snapshot: Some(current),
            });
        }
    }

    let bytes = encode_content(&content, &line_ending, has_bom);
    safe_write(&path, &bytes)?;
    Ok(SaveOutcome {
        status: "saved".to_string(),
        reason: None,
        snapshot: Some(read_snapshot(&path)?),
    })
}

fn read_snapshot(path: &Path) -> Result<FileSnapshot, String> {
    if !path.is_file() {
        return Err(format!("所选路径不是文件：{}", path.display()));
    }
    let bytes =
        fs::read(path).map_err(|error| format!("无法读取文件 {}：{error}", path.display()))?;
    let metadata = fs::metadata(path)
        .map_err(|error| format!("无法读取文件信息 {}：{error}", path.display()))?;
    let has_bom = bytes.starts_with(&[0xEF, 0xBB, 0xBF]);
    let text_bytes = if has_bom { &bytes[3..] } else { &bytes };
    let raw = String::from_utf8(text_bytes.to_vec())
        .map_err(|_| format!("文件不是有效的 UTF-8 文本：{}", path.display()))?;
    let line_ending = if raw.contains("\r\n") { "crlf" } else { "lf" };
    let content = normalize_line_endings(&raw);

    Ok(FileSnapshot {
        content,
        fingerprint: fingerprint(&bytes, &metadata),
        line_ending: line_ending.to_string(),
        has_bom,
        read_only: metadata.permissions().readonly(),
    })
}

fn fingerprint(bytes: &[u8], metadata: &fs::Metadata) -> FileFingerprint {
    // FNV-1a 足以检测本地文本文件是否变化，结果稳定且无需额外依赖。
    let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |value, byte| {
        (value ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    });
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or_default();
    FileFingerprint {
        size: metadata.len(),
        modified_ms,
        hash: format!("{hash:016x}"),
    }
}

fn normalize_line_endings(content: &str) -> String {
    content.replace("\r\n", "\n").replace('\r', "\n")
}

fn encode_content(content: &str, line_ending: &str, has_bom: bool) -> Vec<u8> {
    let normalized = normalize_line_endings(content);
    let output = if line_ending == "crlf" {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    let mut bytes = Vec::with_capacity(output.len() + usize::from(has_bom) * 3);
    if has_bom {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    bytes.extend_from_slice(output.as_bytes());
    bytes
}

fn safe_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("无法确定文件目录：{}", path.display()))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("文件名无效：{}", path.display()))?;
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let temporary = parent.join(format!(".{file_name}.wenrender-{unique}.tmp"));
    let backup = parent.join(format!(".{file_name}.wenrender-{unique}.bak"));

    let mut temporary_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("无法创建临时文件 {}：{error}", temporary.display()))?;
    if let Err(error) = temporary_file
        .write_all(bytes)
        .and_then(|_| temporary_file.sync_all())
    {
        let _ = fs::remove_file(&temporary);
        return Err(format!("无法写入临时文件 {}：{error}", temporary.display()));
    }
    drop(temporary_file);

    if path.exists() {
        if let Ok(metadata) = fs::metadata(path) {
            let _ = fs::set_permissions(&temporary, metadata.permissions());
        }
        fs::rename(path, &backup)
            .map_err(|error| format!("无法备份原文件 {}：{error}", path.display()))?;
    }

    if let Err(error) = fs::rename(&temporary, path) {
        if backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!("无法替换文件 {}：{error}", path.display()));
    }
    if backup.exists() {
        let _ = fs::remove_file(backup);
    }
    Ok(())
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
            // 跳过常见的大型生成目录和隐藏配置目录，控制首次扫描耗时。
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            read_text_file,
            read_file_snapshot,
            inspect_text_file,
            save_text_file_safely
        ])
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

    #[test]
    fn reads_a_persisted_text_file() {
        let readme = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("workspace root")
            .join("README.md");
        let content = read_text_file(readme.to_string_lossy().into_owned()).expect("read README");
        assert!(!content.is_empty());
    }

    #[test]
    fn writes_an_existing_text_file() {
        let path =
            std::env::temp_dir().join(format!("wenrender-write-test-{}.md", std::process::id()));
        std::fs::write(&path, b"\xEF\xBB\xBFbefore\r\nline").expect("create temporary file");
        let before = read_snapshot(&path).expect("read initial snapshot");

        let outcome = save_text_file_safely(
            path.to_string_lossy().into_owned(),
            "after\nline".to_string(),
            "crlf".to_string(),
            true,
            Some(before.fingerprint.hash),
            false,
            false,
        )
        .expect("write existing file");
        assert_eq!(outcome.status, "saved");
        assert_eq!(
            std::fs::read(&path).expect("read temporary file"),
            b"\xEF\xBB\xBFafter\r\nline"
        );

        std::fs::remove_file(path).expect("remove temporary file");
    }

    #[test]
    fn detects_a_save_conflict() {
        let path =
            std::env::temp_dir().join(format!("wenrender-conflict-test-{}.md", std::process::id()));
        std::fs::write(&path, "original").expect("create temporary file");
        let original = read_snapshot(&path).expect("read initial snapshot");
        std::fs::write(&path, "external").expect("simulate external edit");

        let outcome = save_text_file_safely(
            path.to_string_lossy().into_owned(),
            "local".to_string(),
            "lf".to_string(),
            false,
            Some(original.fingerprint.hash),
            false,
            false,
        )
        .expect("return conflict");
        assert_eq!(outcome.status, "conflict");
        assert_eq!(outcome.reason.as_deref(), Some("modified"));
        assert_eq!(
            std::fs::read_to_string(&path).expect("read unchanged external file"),
            "external"
        );

        std::fs::remove_file(path).expect("remove temporary file");
    }

    #[test]
    fn detects_a_file_deleted_before_save() {
        let path =
            std::env::temp_dir().join(format!("wenrender-deleted-test-{}.md", std::process::id()));
        std::fs::write(&path, "original").expect("create temporary file");
        let original = read_snapshot(&path).expect("read initial snapshot");
        std::fs::remove_file(&path).expect("simulate external delete");

        let outcome = save_text_file_safely(
            path.to_string_lossy().into_owned(),
            "local".to_string(),
            "lf".to_string(),
            false,
            Some(original.fingerprint.hash),
            false,
            false,
        )
        .expect("return deleted conflict");
        assert_eq!(outcome.status, "conflict");
        assert_eq!(outcome.reason.as_deref(), Some("deleted"));
        assert!(!path.exists());
    }
}
