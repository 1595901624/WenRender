use std::fs::{self, OpenOptions};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat};

use crate::models::{
    CreatedMarkdownFile, FileFingerprint, FileInspection, FileSnapshot, SaveOutcome, StoredArticleImage,
};

const MAX_IMPORTED_IMAGE_SIZE: usize = 100 * 1024 * 1024;

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

/// 读取本地图片并返回可嵌入 HTML 的 Data URL。
#[tauri::command]
pub(crate) fn read_image_data_url(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(file_path);
    if !path.is_file() {
        return Err(format!("图片不存在或不是普通文件：{}", path.display()));
    }
    let mime =
        image_mime_type(&path).ok_or_else(|| format!("不支持的图片格式：{}", path.display()))?;
    let bytes =
        fs::read(&path).map_err(|error| format!("无法读取图片 {}：{error}", path.display()))?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

/// 将粘贴板数据或磁盘图片保存到 Markdown 文件同级的 assets 目录。
///
/// 未开启压缩时原始字节会原样写入；开启后仅重新编码 PNG、JPEG 与 WebP，
/// GIF、SVG 等格式始终保持原文件，避免动画或矢量信息丢失。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) fn save_article_image(
    document_path: String,
    storage_directory: Option<String>,
    source_path: Option<String>,
    original_name: Option<String>,
    mime_type: Option<String>,
    data_base64: Option<String>,
    compress: bool,
    max_dimension: u32,
    jpeg_quality: u8,
) -> Result<StoredArticleImage, String> {
    let document = PathBuf::from(document_path);
    if !document.is_file() {
        return Err("请先保存当前文章，再粘贴或拖入图片".to_string());
    }
    let document_directory = document
        .parent()
        .ok_or_else(|| "无法确定文章所在目录".to_string())?;

    let (bytes, supplied_name, supplied_extension) = if let Some(source_path) = source_path {
        let source = PathBuf::from(source_path);
        if !source.is_file() {
            return Err(format!("图片不存在或不是普通文件：{}", source.display()));
        }
        let extension = supported_image_extension(&source)
            .ok_or_else(|| format!("不支持的图片格式：{}", source.display()))?
            .to_string();
        let bytes = fs::read(&source)
            .map_err(|error| format!("无法读取图片 {}：{error}", source.display()))?;
        let name = source
            .file_name()
            .and_then(|value| value.to_str())
            .map(str::to_owned);
        (bytes, name, extension)
    } else {
        let encoded = data_base64.ok_or_else(|| "没有收到图片数据".to_string())?;
        let encoded = encoded
            .split_once(',')
            .map(|(_, payload)| payload)
            .unwrap_or(encoded.as_str());
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| "剪贴板图片数据无效".to_string())?;
        let extension = image_extension_from_mime(mime_type.as_deref().unwrap_or(""))
            .ok_or_else(|| "剪贴板中的图片格式暂不支持".to_string())?
            .to_string();
        (bytes, original_name, extension)
    };

    if bytes.is_empty() {
        return Err("图片内容为空".to_string());
    }
    if bytes.len() > MAX_IMPORTED_IMAGE_SIZE {
        return Err("单张图片不能超过 100 MB".to_string());
    }

    let assets_directory = storage_directory
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| document_directory.join("assets"));
    fs::create_dir_all(&assets_directory).map_err(|error| {
        format!(
            "无法创建图片资源目录 {}：{error}",
            assets_directory.display()
        )
    })?;

    let stem = image_file_stem(supplied_name.as_deref());
    let extension = normalize_image_extension(&supplied_extension);
    let target = unique_image_path(&assets_directory, &stem, extension);
    let (output, was_compressed) = maybe_compress_image(
        &bytes,
        extension,
        compress,
        max_dimension.clamp(320, 7680),
        jpeg_quality.clamp(60, 95),
    )?;
    safe_write(&target, &output)?;

    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "生成的图片文件名无效".to_string())?
        .to_string();
    Ok(StoredArticleImage {
        relative_path: article_image_path(document_directory, &target),
        file_name,
        original_size: bytes.len() as u64,
        saved_size: output.len() as u64,
        compressed: was_compressed,
    })
}

fn article_image_path(document_directory: &Path, image_path: &Path) -> String {
    let path = pathdiff::diff_paths(image_path, document_directory)
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| image_path.to_path_buf());
    let normalized = path.to_string_lossy().replace('\\', "/");
    if normalized.starts_with("../")
        || normalized.starts_with("./")
        || Path::new(&normalized).is_absolute()
    {
        normalized
    } else {
        format!("./{normalized}")
    }
}

fn image_mime_type(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" | "jpe" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "avif" => Some("image/avif"),
        "ico" => Some("image/x-icon"),
        "tif" | "tiff" => Some("image/tiff"),
        _ => None,
    }
}

fn supported_image_extension(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("png"),
        "jpg" | "jpeg" | "jpe" => Some("jpg"),
        "gif" => Some("gif"),
        "webp" => Some("webp"),
        "svg" => Some("svg"),
        "bmp" => Some("bmp"),
        "avif" => Some("avif"),
        "ico" => Some("ico"),
        "tif" | "tiff" => Some("tiff"),
        _ => None,
    }
}

fn image_extension_from_mime(mime: &str) -> Option<&'static str> {
    match mime.to_ascii_lowercase().as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        "image/avif" => Some("avif"),
        "image/x-icon" | "image/vnd.microsoft.icon" => Some("ico"),
        "image/tiff" => Some("tiff"),
        _ => None,
    }
}

fn normalize_image_extension(extension: &str) -> &str {
    match extension {
        "jpeg" | "jpe" => "jpg",
        "tif" => "tiff",
        value => value,
    }
}

fn image_file_stem(original_name: Option<&str>) -> String {
    let original = original_name
        .and_then(|name| Path::new(name).file_stem())
        .and_then(|stem| stem.to_str())
        .unwrap_or("image");
    let mut sanitized = String::with_capacity(original.len());
    let mut previous_separator = false;
    for character in original.chars() {
        if character.is_alphanumeric() || matches!(character, '-' | '_') {
            sanitized.push(character);
            previous_separator = false;
        } else if !previous_separator {
            sanitized.push('-');
            previous_separator = true;
        }
    }
    let sanitized = sanitized.trim_matches('-');
    if sanitized.is_empty() || sanitized.eq_ignore_ascii_case("image") {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default();
        format!("image-{timestamp}")
    } else {
        sanitized.chars().take(80).collect()
    }
}

fn unique_image_path(directory: &Path, stem: &str, extension: &str) -> PathBuf {
    let candidate = directory.join(format!("{stem}.{extension}"));
    if !candidate.exists() {
        return candidate;
    }
    for suffix in 2..=10_000 {
        let candidate = directory.join(format!("{stem}-{suffix}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    directory.join(format!("{stem}-{unique}.{extension}"))
}

fn maybe_compress_image(
    bytes: &[u8],
    extension: &str,
    compress: bool,
    max_dimension: u32,
    jpeg_quality: u8,
) -> Result<(Vec<u8>, bool), String> {
    if !compress || !matches!(extension, "png" | "jpg" | "webp") {
        return Ok((bytes.to_vec(), false));
    }

    let format = match extension {
        "png" => ImageFormat::Png,
        "jpg" => ImageFormat::Jpeg,
        "webp" => ImageFormat::WebP,
        _ => unreachable!(),
    };
    let decoded = image::load_from_memory_with_format(bytes, format)
        .map_err(|error| format!("无法解码图片以进行压缩：{error}"))?;
    let resized = resize_to_max_dimension(decoded, max_dimension);
    let mut output = Vec::new();
    if extension == "jpg" {
        JpegEncoder::new_with_quality(&mut output, jpeg_quality)
            .encode_image(&resized)
            .map_err(|error| format!("无法压缩 JPEG 图片：{error}"))?;
    } else {
        resized
            .write_to(&mut Cursor::new(&mut output), format)
            .map_err(|error| format!("无法压缩图片：{error}"))?;
    }
    Ok((output, true))
}

fn resize_to_max_dimension(image: DynamicImage, maximum: u32) -> DynamicImage {
    if image.width() <= maximum && image.height() <= maximum {
        return image;
    }
    image.resize(maximum, maximum, FilterType::Lanczos3)
}

/// 读取文件正文、换行符、BOM、只读状态和磁盘指纹。
#[tauri::command]
pub(crate) fn read_file_snapshot(file_path: String) -> Result<FileSnapshot, String> {
    read_snapshot(Path::new(&file_path))
}

/// 在指定的已打开目录中直接创建一个空 Markdown 文件。
/// 文件名只允许是单个名称，避免调用方借此写入到目标目录之外。
#[tauri::command]
pub(crate) fn create_markdown_file(
    directory_path: String,
    file_name: String,
) -> Result<CreatedMarkdownFile, String> {
    let directory = PathBuf::from(directory_path);
    if !directory.is_dir() {
        return Err("目标目录不存在或不可访问".to_string());
    }

    let requested = file_name.trim();
    if requested.is_empty() {
        return Err("请输入文件名".to_string());
    }
    if requested == "." || requested == ".." || requested.contains(['/', '\\']) {
        return Err("文件名不能包含路径分隔符".to_string());
    }

    let name = if requested.to_ascii_lowercase().ends_with(".md") {
        requested.to_string()
    } else {
        format!("{requested}.md")
    };
    let path = directory.join(&name);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                format!("文件已存在：{name}")
            } else {
                format!("无法创建文件 {}：{error}", path.display())
            }
        })?;
    file.write_all(b"")
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("无法写入文件 {}：{error}", path.display()))?;

    Ok(CreatedMarkdownFile {
        path: path.to_string_lossy().into_owned(),
        snapshot: read_snapshot(&path)?,
    })
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
    fn creates_markdown_file_directly_in_requested_directory() {
        let directory = std::env::temp_dir().join(format!(
            "wenrender-create-test-{}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).expect("create temporary directory");

        let created = create_markdown_file(
            directory.to_string_lossy().into_owned(),
            "draft".to_string(),
        )
        .expect("create markdown file");

        assert_eq!(PathBuf::from(&created.path), directory.join("draft.md"));
        assert!(PathBuf::from(&created.path).is_file());
        assert!(created.snapshot.content.is_empty());
        assert!(create_markdown_file(
            directory.to_string_lossy().into_owned(),
            "nested/draft".to_string(),
        )
        .is_err());

        fs::remove_dir_all(directory).expect("remove temporary directory");
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
    fn converts_a_local_image_to_a_data_url() {
        let path =
            std::env::temp_dir().join(format!("wenrender-image-test-{}.png", std::process::id()));
        fs::write(&path, [0x89, b'P', b'N', b'G']).expect("create temporary image");

        let data_url =
            read_image_data_url(path.to_string_lossy().into_owned()).expect("read image");
        assert_eq!(data_url, "data:image/png;base64,iVBORw==");

        fs::remove_file(path).expect("remove temporary image");
    }

    #[test]
    fn stores_an_unmodified_article_image_in_assets() {
        let root =
            std::env::temp_dir().join(format!("wenrender-assets-test-{}", std::process::id()));
        let article = root.join("article.md");
        fs::create_dir_all(&root).expect("create temporary directory");
        fs::write(&article, "# article").expect("create article");
        let png = STANDARD.encode([0x89, b'P', b'N', b'G']);

        let stored = save_article_image(
            article.to_string_lossy().into_owned(),
            None,
            None,
            Some("pasted image.png".to_string()),
            Some("image/png".to_string()),
            Some(png),
            false,
            1920,
            85,
        )
        .expect("store image");

        assert!(stored.relative_path.starts_with("./assets/pasted-image"));
        assert_eq!(stored.original_size, stored.saved_size);
        assert!(!stored.compressed);
        assert_eq!(
            fs::read(root.join(&stored.relative_path[2..])).expect("read stored image"),
            [0x89, b'P', b'N', b'G']
        );

        let second = save_article_image(
            article.to_string_lossy().into_owned(),
            None,
            None,
            Some("pasted image.png".to_string()),
            Some("image/png".to_string()),
            Some(STANDARD.encode([0x89, b'P', b'N', b'G'])),
            false,
            1920,
            85,
        )
        .expect("store a second image");
        assert_ne!(stored.relative_path, second.relative_path);

        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn stores_an_article_image_in_a_custom_directory() {
        let root = std::env::temp_dir().join(format!(
            "wenrender-custom-assets-test-{}",
            std::process::id()
        ));
        let article_directory = root.join("articles");
        let custom_directory = root.join("shared images");
        let article = article_directory.join("article.md");
        fs::create_dir_all(&article_directory).expect("create article directory");
        fs::write(&article, "# article").expect("create article");

        let stored = save_article_image(
            article.to_string_lossy().into_owned(),
            Some(custom_directory.to_string_lossy().into_owned()),
            None,
            Some("cover.png".to_string()),
            Some("image/png".to_string()),
            Some(STANDARD.encode([0x89, b'P', b'N', b'G'])),
            false,
            1920,
            85,
        )
        .expect("store image in custom directory");

        assert_eq!(stored.relative_path, "../shared images/cover.png");
        assert!(custom_directory.join("cover.png").is_file());

        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn resizes_an_article_image_when_compression_is_enabled() {
        let root =
            std::env::temp_dir().join(format!("wenrender-resize-test-{}", std::process::id()));
        let article = root.join("article.md");
        fs::create_dir_all(&root).expect("create temporary directory");
        fs::write(&article, "# article").expect("create article");

        let source = DynamicImage::new_rgb8(800, 400);
        let mut encoded = Vec::new();
        source
            .write_to(&mut Cursor::new(&mut encoded), ImageFormat::Png)
            .expect("encode source image");
        let stored = save_article_image(
            article.to_string_lossy().into_owned(),
            None,
            None,
            Some("large.png".to_string()),
            Some("image/png".to_string()),
            Some(STANDARD.encode(encoded)),
            true,
            320,
            85,
        )
        .expect("compress image");

        let output = image::open(root.join(&stored.relative_path[2..])).expect("read output image");
        assert_eq!((output.width(), output.height()), (320, 160));
        assert!(stored.compressed);

        fs::remove_dir_all(root).expect("remove temporary directory");
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
