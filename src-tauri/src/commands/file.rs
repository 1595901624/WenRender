use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::{FileFingerprint, FileInspection, FileSnapshot, SaveOutcome};

/// 读取 UTF-8 文本文件。
///
/// 文件对话框授予 WebView 的访问权限不会跨重启保留，因此恢复工作区时由 Rust
/// 命令读取用户之前明确打开过的文件。
#[tauri::command]
pub(crate) fn read_text_file(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(file_path);
    if !path.is_file() {
        return Err("所选路径不是文件".to_string());
    }
    fs::read_to_string(&path).map_err(|error| format!("无法读取文件 {}：{error}", path.display()))
}

/// 读取文件正文、换行符、BOM、只读状态和磁盘指纹。
#[tauri::command]
pub(crate) fn read_file_snapshot(file_path: String) -> Result<FileSnapshot, String> {
    read_snapshot(Path::new(&file_path))
}

/// 检查文件是否存在及是否被外部程序修改，不返回文件正文。
#[tauri::command]
pub(crate) fn inspect_text_file(file_path: String) -> Result<FileInspection, String> {
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

/// 在写入前检查外部修改，并通过临时文件替换的方式安全保存正文。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) fn save_text_file_safely(
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

/// 从磁盘构建规范化的文件快照，编辑器内部统一使用 LF 换行。
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

    Ok(FileSnapshot {
        content: normalize_line_endings(&raw),
        fingerprint: fingerprint(&bytes, &metadata),
        line_ending: line_ending.to_string(),
        has_bom,
        read_only: metadata.permissions().readonly(),
    })
}

/// 使用文件大小、修改时间和 FNV-1a 哈希生成稳定的本地文件指纹。
fn fingerprint(bytes: &[u8], metadata: &fs::Metadata) -> FileFingerprint {
    // FNV-1a 足以检测本地文本变化，且无需为这个高频操作引入额外依赖。
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

/// 按原文件的换行符与 BOM 设置重新编码编辑器正文。
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

/// 先完整写入同目录临时文件，再替换原文件，降低中途失败造成文件损坏的风险。
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
        // 替换失败时尽力恢复原文件，随后清理未使用的临时文件。
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

#[cfg(test)]
mod tests {
    use super::*;

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
        fs::write(&path, b"\xEF\xBB\xBFbefore\r\nline").expect("create temporary file");
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
            fs::read(&path).expect("read temporary file"),
            b"\xEF\xBB\xBFafter\r\nline"
        );

        fs::remove_file(path).expect("remove temporary file");
    }

    #[test]
    fn detects_a_save_conflict() {
        let path =
            std::env::temp_dir().join(format!("wenrender-conflict-test-{}.md", std::process::id()));
        fs::write(&path, "original").expect("create temporary file");
        let original = read_snapshot(&path).expect("read initial snapshot");
        fs::write(&path, "external").expect("simulate external edit");

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
            fs::read_to_string(&path).expect("read unchanged external file"),
            "external"
        );

        fs::remove_file(path).expect("remove temporary file");
    }

    #[test]
    fn detects_a_file_deleted_before_save() {
        let path =
            std::env::temp_dir().join(format!("wenrender-deleted-test-{}.md", std::process::id()));
        fs::write(&path, "original").expect("create temporary file");
        let original = read_snapshot(&path).expect("read initial snapshot");
        fs::remove_file(&path).expect("simulate external delete");

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
