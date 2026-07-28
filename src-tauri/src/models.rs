use serde::Serialize;

/// 目录树中的一个目录或文件节点。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DirectoryNode {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) is_directory: bool,
    pub(crate) is_markdown: bool,
    pub(crate) content: Option<String>,
    pub(crate) children: Vec<DirectoryNode>,
}

/// 打开目录后返回给前端的完整目录树。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DirectoryTree {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) children: Vec<DirectoryNode>,
}

/// 用于判断磁盘文件是否变化的轻量指纹。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileFingerprint {
    pub(crate) size: u64,
    pub(crate) modified_ms: u64,
    pub(crate) hash: String,
}

/// 文件内容以及保存时需要保留的编码信息。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileSnapshot {
    pub(crate) content: String,
    pub(crate) fingerprint: FileFingerprint,
    pub(crate) line_ending: String,
    pub(crate) has_bom: bool,
    pub(crate) read_only: bool,
}

/// 不读取正文时返回的文件状态，用于检测外部修改和删除。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileInspection {
    pub(crate) exists: bool,
    pub(crate) fingerprint: Option<FileFingerprint>,
    pub(crate) read_only: bool,
}

/// 安全保存的结果；发生冲突时由前端决定覆盖、重载或另存。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveOutcome {
    pub(crate) status: String,
    pub(crate) reason: Option<String>,
    pub(crate) snapshot: Option<FileSnapshot>,
}

/// 保存到文章资源目录后的图片信息。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredArticleImage {
    pub(crate) relative_path: String,
    pub(crate) file_name: String,
    pub(crate) original_size: u64,
    pub(crate) saved_size: u64,
    pub(crate) compressed: bool,
}
