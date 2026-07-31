use std::{
    collections::{HashMap, HashSet},
    io::Cursor,
    net::IpAddr,
    path::Path,
    time::Duration,
};

use image::{codecs::jpeg::JpegEncoder, DynamicImage, GenericImageView};
use percent_encoding::percent_decode_str;
use regex::Regex;
use reqwest::{multipart, Client, Response, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const KEYRING_SERVICE: &str = "com.wenrender.wechat-official-account";
const MAX_BODY_IMAGE_BYTES: usize = 1024 * 1024;
const MAX_COVER_BYTES: usize = 10 * 1024 * 1024;
const MAX_REMOTE_IMAGE_BYTES: usize = 12 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WechatDraftRequest {
    account_id: String,
    app_id: String,
    media_id: Option<String>,
    title: String,
    author: String,
    digest: String,
    content: String,
    content_source_url: String,
    cover_path: String,
    cover_media_id: Option<String>,
    cover_hash: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WechatDraftResult {
    media_id: String,
    cover_media_id: String,
    cover_hash: String,
    updated: bool,
    uploaded_images: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WechatConnectionResult {
    expires_in: u64,
}

#[derive(Deserialize)]
struct AccessTokenResponse {
    access_token: Option<String>,
    expires_in: Option<u64>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Deserialize)]
struct UploadedBodyImage {
    url: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Deserialize)]
struct UploadedMaterial {
    media_id: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Deserialize)]
struct AddedDraft {
    media_id: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[tauri::command]
pub(crate) fn save_wechat_account_secret(
    account_id: String,
    app_secret: String,
) -> Result<(), String> {
    validate_account_id(&account_id)?;
    if app_secret.trim().is_empty() {
        return Err("AppSecret 不能为空".to_string());
    }
    keyring_entry(&account_id)?
        .set_password(app_secret.trim())
        .map_err(|error| format!("无法写入系统密钥库：{error}"))
}

#[tauri::command]
pub(crate) fn get_wechat_account_secret_status(account_id: String) -> Result<bool, String> {
    validate_account_id(&account_id)?;
    match keyring_entry(&account_id)?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("无法读取系统密钥库：{error}")),
    }
}

#[tauri::command]
pub(crate) fn delete_wechat_account_secret(account_id: String) -> Result<(), String> {
    validate_account_id(&account_id)?;
    match keyring_entry(&account_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("无法删除系统密钥库凭据：{error}")),
    }
}

#[tauri::command]
pub(crate) async fn test_wechat_account(
    account_id: String,
    app_id: String,
) -> Result<WechatConnectionResult, String> {
    let client = wechat_client()?;
    let (_, expires_in) = access_token(&client, &account_id, &app_id).await?;
    Ok(WechatConnectionResult { expires_in })
}

#[tauri::command]
pub(crate) async fn sync_wechat_draft(
    request: WechatDraftRequest,
) -> Result<WechatDraftResult, String> {
    validate_draft_request(&request)?;
    let client = wechat_client()?;
    let (token, _) = access_token(&client, &request.account_id, &request.app_id).await?;
    let (content, uploaded_images) =
        upload_content_images(&client, &token, &request.content).await?;
    if content.chars().count() > 20_000 || content.len() > 1024 * 1024 {
        return Err(
            "公众号正文超过接口限制（最多约 2 万字符且小于 1 MB），请精简文章或样式".to_string(),
        );
    }
    let cover_bytes =
        std::fs::read(&request.cover_path).map_err(|error| format!("无法读取封面图片：{error}"))?;
    let cover_hash = hex::encode(Sha256::digest(&cover_bytes));
    let cover_media_id = if request.cover_hash.as_deref() == Some(&cover_hash) {
        if let Some(media_id) = request
            .cover_media_id
            .filter(|value| !value.trim().is_empty())
        {
            media_id
        } else {
            upload_cover(&client, &token, &request.cover_path, cover_bytes).await?
        }
    } else {
        upload_cover(&client, &token, &request.cover_path, cover_bytes).await?
    };
    let article = json!({
        "article_type": "news",
        "title": request.title.trim(),
        "author": request.author.trim(),
        "digest": request.digest.trim(),
        "content": content,
        "content_source_url": request.content_source_url.trim(),
        "thumb_media_id": cover_media_id,
        "need_open_comment": 0,
        "only_fans_can_comment": 0
    });

    let existing_media_id = request
        .media_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let (media_id, updated) = if let Some(media_id) = existing_media_id {
        let url = api_url("/cgi-bin/draft/update", &token)?;
        let response = client
            .post(url)
            .json(&json!({
                "media_id": media_id,
                "index": 0,
                "articles": article
            }))
            .send()
            .await
            .map_err(|error| format!("更新公众号草稿失败：{error}"))?;
        ensure_wechat_success(response, "更新草稿").await?;
        (media_id.to_string(), true)
    } else {
        let url = api_url("/cgi-bin/draft/add", &token)?;
        let response = client
            .post(url)
            .json(&json!({ "articles": [article] }))
            .send()
            .await
            .map_err(|error| format!("创建公众号草稿失败：{error}"))?;
        let status = response.status();
        let payload: AddedDraft = response
            .json()
            .await
            .map_err(|error| format!("无法读取创建草稿响应：{error}"))?;
        if !status.is_success() || payload.errcode.unwrap_or_default() != 0 {
            return Err(wechat_error(
                "创建草稿",
                payload.errcode,
                payload.errmsg.as_deref(),
                status,
            ));
        }
        (
            payload
                .media_id
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "微信接口未返回草稿 media_id".to_string())?,
            false,
        )
    };

    Ok(WechatDraftResult {
        media_id,
        cover_media_id,
        cover_hash,
        updated,
        uploaded_images,
    })
}

fn validate_draft_request(request: &WechatDraftRequest) -> Result<(), String> {
    validate_account_id(&request.account_id)?;
    require(&request.app_id, "AppID")?;
    require(&request.title, "文章标题")?;
    require(&request.content, "文章正文")?;
    require(&request.cover_path, "封面图片")?;
    if request.title.chars().count() > 64 {
        return Err("文章标题不能超过 64 个字符".to_string());
    }
    if request.digest.chars().count() > 120 {
        return Err("文章摘要不能超过 120 个字符".to_string());
    }
    if !request.content_source_url.trim().is_empty() {
        let url = Url::parse(request.content_source_url.trim())
            .map_err(|_| "原文链接不是有效 URL".to_string())?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err("原文链接必须使用 HTTP 或 HTTPS".to_string());
        }
    }
    Ok(())
}

async fn access_token(
    client: &Client,
    account_id: &str,
    app_id: &str,
) -> Result<(String, u64), String> {
    validate_account_id(account_id)?;
    require(app_id, "AppID")?;
    let secret = match keyring_entry(account_id)?.get_password() {
        Ok(value) if !value.trim().is_empty() => value,
        Ok(_) | Err(keyring::Error::NoEntry) => {
            return Err("该公众号尚未保存 AppSecret，请先到设置页绑定".to_string())
        }
        Err(error) => return Err(format!("无法读取系统密钥库：{error}")),
    };
    let response = client
        .get("https://api.weixin.qq.com/cgi-bin/token")
        .query(&[
            ("grant_type", "client_credential"),
            ("appid", app_id.trim()),
            ("secret", secret.trim()),
        ])
        .send()
        .await
        .map_err(|error| format!("无法连接微信接口：{error}"))?;
    let status = response.status();
    let payload: AccessTokenResponse = response
        .json()
        .await
        .map_err(|error| format!("无法读取微信凭据响应：{error}"))?;
    if !status.is_success() || payload.errcode.unwrap_or_default() != 0 {
        return Err(wechat_error(
            "获取 access_token",
            payload.errcode,
            payload.errmsg.as_deref(),
            status,
        ));
    }
    Ok((
        payload
            .access_token
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "微信接口未返回 access_token".to_string())?,
        payload.expires_in.unwrap_or(7200),
    ))
}

async fn upload_content_images(
    client: &Client,
    token: &str,
    content: &str,
) -> Result<(String, usize), String> {
    let image_regex = Regex::new(r#"<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')"#)
        .map_err(|error| format!("无法解析正文图片：{error}"))?;
    let mut sources = Vec::new();
    let mut seen = HashSet::new();
    for captures in image_regex.captures_iter(content) {
        let source = captures
            .get(1)
            .or_else(|| captures.get(2))
            .map(|value| value.as_str())
            .unwrap_or_default();
        if should_upload_content_image(source) && seen.insert(source.to_string()) {
            sources.push(source.to_string());
        }
    }
    let mut replacements = HashMap::new();
    for source in &sources {
        let image = load_content_image(client, &decode_html_attribute(source)).await?;
        let url = upload_body_image(client, token, image).await?;
        replacements.insert(source.clone(), url);
    }
    let mut rewritten = content.to_string();
    for (source, url) in replacements {
        rewritten = rewritten.replace(&source, &url);
    }
    Ok((rewritten, sources.len()))
}

fn should_upload_content_image(source: &str) -> bool {
    if source.starts_with("wenrender-local-image:") {
        return true;
    }
    if let Ok(url) = Url::parse(source) {
        if !matches!(url.scheme(), "http" | "https") {
            return false;
        }
        let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
        return !host.ends_with(".qpic.cn")
            && host != "qpic.cn"
            && !host.ends_with(".qlogo.cn")
            && host != "qlogo.cn";
    }
    false
}

fn decode_html_attribute(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

async fn load_content_image(client: &Client, source: &str) -> Result<PreparedImage, String> {
    if let Some(encoded) = source.strip_prefix("wenrender-local-image:") {
        let path = percent_decode_str(encoded)
            .decode_utf8()
            .map_err(|_| "正文图片路径编码无效".to_string())?
            .into_owned();
        let bytes =
            std::fs::read(&path).map_err(|error| format!("无法读取正文图片 {path}：{error}"))?;
        return prepare_image(&bytes, Path::new(&path), MAX_BODY_IMAGE_BYTES);
    }
    let url = validate_remote_image_url(source)?;
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|error| format!("无法下载正文图片 {url}：{error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载正文图片失败（HTTP {}）：{url}",
            response.status()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_REMOTE_IMAGE_BYTES as u64)
    {
        return Err(format!("远程正文图片超过 12 MB：{url}"));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("无法读取正文图片 {url}：{error}"))?;
    if bytes.len() > MAX_REMOTE_IMAGE_BYTES {
        return Err(format!("远程正文图片超过 12 MB：{url}"));
    }
    let file_name = url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|value| !value.is_empty())
        .unwrap_or("remote-image.jpg");
    prepare_image(&bytes, Path::new(file_name), MAX_BODY_IMAGE_BYTES)
}

async fn upload_body_image(
    client: &Client,
    token: &str,
    image: PreparedImage,
) -> Result<String, String> {
    let url = api_url("/cgi-bin/media/uploadimg", token)?;
    let response = client
        .post(url)
        .multipart(
            multipart::Form::new().part(
                "media",
                multipart::Part::bytes(image.bytes)
                    .file_name(image.file_name)
                    .mime_str(&image.mime_type)
                    .map_err(|error| format!("正文图片类型无效：{error}"))?,
            ),
        )
        .send()
        .await
        .map_err(|error| format!("上传正文图片失败：{error}"))?;
    let status = response.status();
    let payload: UploadedBodyImage = response
        .json()
        .await
        .map_err(|error| format!("无法读取正文图片上传响应：{error}"))?;
    if !status.is_success() || payload.errcode.unwrap_or_default() != 0 {
        return Err(wechat_error(
            "上传正文图片",
            payload.errcode,
            payload.errmsg.as_deref(),
            status,
        ));
    }
    payload
        .url
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "微信接口未返回正文图片 URL".to_string())
}

async fn upload_cover(
    client: &Client,
    token: &str,
    cover_path: &str,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let image = prepare_image(&bytes, Path::new(cover_path), MAX_COVER_BYTES)?;
    let mut url = api_url("/cgi-bin/material/add_material", token)?;
    url.query_pairs_mut().append_pair("type", "image");
    let response = client
        .post(url)
        .multipart(
            multipart::Form::new().part(
                "media",
                multipart::Part::bytes(image.bytes)
                    .file_name(image.file_name)
                    .mime_str(&image.mime_type)
                    .map_err(|error| format!("封面图片类型无效：{error}"))?,
            ),
        )
        .send()
        .await
        .map_err(|error| format!("上传封面失败：{error}"))?;
    let status = response.status();
    let payload: UploadedMaterial = response
        .json()
        .await
        .map_err(|error| format!("无法读取封面上传响应：{error}"))?;
    if !status.is_success() || payload.errcode.unwrap_or_default() != 0 {
        return Err(wechat_error(
            "上传封面",
            payload.errcode,
            payload.errmsg.as_deref(),
            status,
        ));
    }
    payload
        .media_id
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "微信接口未返回封面 media_id".to_string())
}

struct PreparedImage {
    bytes: Vec<u8>,
    mime_type: String,
    file_name: String,
}

fn prepare_image(bytes: &[u8], path: &Path, maximum: usize) -> Result<PreparedImage, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if bytes.len() <= maximum && matches!(extension.as_str(), "jpg" | "jpeg" | "png") {
        return Ok(PreparedImage {
            bytes: bytes.to_vec(),
            mime_type: if extension == "png" {
                "image/png"
            } else {
                "image/jpeg"
            }
            .to_string(),
            file_name: safe_image_name(path, &extension),
        });
    }
    let mut image = image::load_from_memory(bytes)
        .map_err(|_| "微信正文和封面仅支持可解码的常见图片格式".to_string())?;
    let (width, height) = image.dimensions();
    if width > 4096 || height > 4096 {
        image = image.resize(4096, 4096, image::imageops::FilterType::Lanczos3);
    }
    for quality in [88_u8, 80, 72, 64, 56, 48, 40] {
        let encoded = encode_jpeg(&image, quality)?;
        if encoded.len() <= maximum {
            return Ok(PreparedImage {
                bytes: encoded,
                mime_type: "image/jpeg".to_string(),
                file_name: safe_image_name(path, "jpg"),
            });
        }
    }
    for maximum_dimension in [3200_u32, 2400, 1800, 1280, 960] {
        image = image.resize(
            maximum_dimension,
            maximum_dimension,
            image::imageops::FilterType::Lanczos3,
        );
        let encoded = encode_jpeg(&image, 72)?;
        if encoded.len() <= maximum {
            return Ok(PreparedImage {
                bytes: encoded,
                mime_type: "image/jpeg".to_string(),
                file_name: safe_image_name(path, "jpg"),
            });
        }
    }
    Err(format!(
        "图片压缩后仍超过 {} MB，请先手动缩小",
        maximum / 1024 / 1024
    ))
}

fn encode_jpeg(image: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut output = Cursor::new(Vec::new());
    JpegEncoder::new_with_quality(&mut output, quality)
        .encode_image(&DynamicImage::ImageRgb8(image.to_rgb8()))
        .map_err(|error| format!("无法转换图片：{error}"))?;
    Ok(output.into_inner())
}

fn safe_image_name(path: &Path, extension: &str) -> String {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image")
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    format!("{}.{}", stem.trim_matches('-'), extension)
}

fn validate_remote_image_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "正文图片 URL 无效".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("远程正文图片只支持 HTTP 或 HTTPS".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "正文图片 URL 缺少主机名".to_string())?;
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") {
        return Err("不允许从本机地址下载正文图片".to_string());
    }
    if host.parse::<IpAddr>().is_ok_and(is_private_address) {
        return Err("不允许从内网地址下载正文图片".to_string());
    }
    Ok(url)
}

fn is_private_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(value) => {
            value.is_private()
                || value.is_loopback()
                || value.is_link_local()
                || value.is_broadcast()
                || value.is_documentation()
                || value.is_unspecified()
        }
        IpAddr::V6(value) => {
            value.is_loopback()
                || value.is_unspecified()
                || value.is_unique_local()
                || value.is_unicast_link_local()
        }
    }
}

async fn ensure_wechat_success(response: Response, action: &str) -> Result<(), String> {
    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("无法读取微信接口响应：{error}"))?;
    let errcode = payload.get("errcode").and_then(Value::as_i64);
    if status.is_success() && errcode.unwrap_or_default() == 0 {
        return Ok(());
    }
    Err(wechat_error(
        action,
        errcode,
        payload.get("errmsg").and_then(Value::as_str),
        status,
    ))
}

fn wechat_error(
    action: &str,
    errcode: Option<i64>,
    errmsg: Option<&str>,
    status: StatusCode,
) -> String {
    let code = errcode.unwrap_or_default();
    let hint = match code {
        40013 => "请检查 AppID 是否正确",
        40007 => "草稿或封面素材已失效，可改为创建新草稿后重试",
        40125 => "请检查 AppSecret 是否正确",
        40164 => "当前公网 IP 不在公众号后台的 API IP 白名单中",
        45009 => "公众号接口调用次数已达上限，请稍后再试",
        48001 => "该公众号没有草稿箱接口权限，请检查账号认证和接口权限",
        _ => "",
    };
    let detail = errmsg.unwrap_or("unknown error");
    if hint.is_empty() {
        format!("{action}失败（HTTP {status}，微信错误 {code}）：{detail}")
    } else {
        format!("{action}失败（微信错误 {code}）：{hint}。{detail}")
    }
}

fn api_url(path: &str, token: &str) -> Result<Url, String> {
    let mut url = Url::parse("https://api.weixin.qq.com")
        .map_err(|error| format!("微信接口地址无效：{error}"))?;
    url.set_path(path);
    url.query_pairs_mut().append_pair("access_token", token);
    Ok(url)
}

fn wechat_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .user_agent("WenRender-wechat-draft")
        .build()
        .map_err(|error| format!("无法初始化微信接口客户端：{error}"))
}

fn keyring_entry(account_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, account_id)
        .map_err(|error| format!("无法访问系统密钥库：{error}"))
}

fn validate_account_id(account_id: &str) -> Result<(), String> {
    let value = account_id.trim();
    if value.is_empty()
        || value.len() > 128
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("公众号配置标识无效".to_string());
    }
    Ok(())
}

fn require(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("请填写{label}"))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{is_private_address, prepare_image, should_upload_content_image};
    use image::DynamicImage;
    use std::{io::Cursor, net::IpAddr, path::Path};

    #[test]
    fn skips_existing_wechat_cdn_images() {
        assert!(!should_upload_content_image(
            "https://mmbiz.qpic.cn/mmbiz_png/example/0"
        ));
        assert!(should_upload_content_image(
            "https://images.example.com/article.png"
        ));
        assert!(should_upload_content_image(
            "wenrender-local-image:C%3A%5Carticle.png"
        ));
    }

    #[test]
    fn rejects_private_literal_addresses() {
        assert!(is_private_address(
            "127.0.0.1".parse::<IpAddr>().expect("loopback")
        ));
        assert!(is_private_address(
            "192.168.1.10".parse::<IpAddr>().expect("private")
        ));
        assert!(!is_private_address(
            "8.8.8.8".parse::<IpAddr>().expect("public")
        ));
    }

    #[test]
    fn converts_large_non_jpeg_image_for_wechat() {
        let image = DynamicImage::new_rgb8(1200, 800);
        let mut bytes = Cursor::new(Vec::new());
        image
            .write_to(&mut bytes, image::ImageFormat::Bmp)
            .expect("encode test bitmap");
        let prepared = prepare_image(&bytes.into_inner(), Path::new("cover.bmp"), 1024 * 1024)
            .expect("prepare image");
        assert_eq!(prepared.mime_type, "image/jpeg");
        assert!(prepared.bytes.len() <= 1024 * 1024);
    }
}
