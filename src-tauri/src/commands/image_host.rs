use std::{collections::HashMap, fs, path::Path};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use hmac::{Hmac, Mac};
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE},
    multipart, Client, StatusCode,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use url::Url;

type HmacSha256 = Hmac<Sha256>;

const KEYRING_SERVICE: &str = "com.wenrender.image-host";
const PATH_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'`')
    .add(b'{')
    .add(b'}');

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImageHostConfig {
    provider: String,
    endpoint: String,
    region: String,
    bucket: String,
    path_prefix: String,
    public_base_url: String,
    github_owner: String,
    github_repo: String,
    github_branch: String,
    custom_method: String,
    custom_file_field: String,
    custom_response_url_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadedImage {
    url: String,
    object_key: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectStoreSecrets {
    access_key_id: String,
    secret_access_key: String,
    #[serde(default)]
    session_token: String,
}

#[derive(Deserialize)]
struct GithubSecrets {
    token: String,
}

#[derive(Deserialize)]
struct CustomSecrets {
    #[serde(default)]
    headers: HashMap<String, String>,
}

#[tauri::command]
pub(crate) fn save_image_host_secrets(
    provider: String,
    secrets_json: String,
) -> Result<(), String> {
    validate_provider(&provider)?;
    serde_json::from_str::<Value>(&secrets_json)
        .map_err(|error| format!("凭据格式无效：{error}"))?;
    keyring_entry(&provider)?
        .set_password(&secrets_json)
        .map_err(|error| format!("无法写入系统密钥库：{error}"))
}

#[tauri::command]
pub(crate) fn get_image_host_secret_status(provider: String) -> Result<bool, String> {
    validate_provider(&provider)?;
    match keyring_entry(&provider)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("无法读取系统密钥库：{error}")),
    }
}

#[tauri::command]
pub(crate) fn delete_image_host_secrets(provider: String) -> Result<(), String> {
    validate_provider(&provider)?;
    let entry = keyring_entry(&provider)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("无法从系统密钥库删除凭据：{error}")),
    }
}

#[tauri::command]
pub(crate) async fn upload_image_to_host(
    config: ImageHostConfig,
    file_path: String,
) -> Result<UploadedImage, String> {
    validate_provider(&config.provider)?;
    let path = Path::new(&file_path);
    if !path.is_file() {
        return Err(format!("图片不存在或不是普通文件：{}", path.display()));
    }
    let bytes =
        fs::read(path).map_err(|error| format!("无法读取图片 {}：{error}", path.display()))?;
    if bytes.is_empty() {
        return Err("图片内容为空".to_string());
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "图片文件名无效".to_string())?;
    let object_key = object_key(&config.path_prefix, file_name, &bytes);
    let content_type = image_content_type(path);
    let secrets = keyring_entry(&config.provider)?
        .get_password()
        .map_err(|_| {
            format!(
                "尚未在系统密钥库中保存 {} 凭据",
                provider_name(&config.provider)
            )
        })?;
    let client = Client::builder()
        .build()
        .map_err(|error| format!("无法创建上传客户端：{error}"))?;

    match config.provider.as_str() {
        "s3" | "oss" | "cos" | "r2" => {
            let credentials: ObjectStoreSecrets = serde_json::from_str(&secrets)
                .map_err(|_| "对象存储凭据格式无效，请重新保存".to_string())?;
            upload_s3_compatible(
                &client,
                &config,
                &credentials,
                &object_key,
                content_type,
                bytes,
            )
            .await
        }
        "github" => {
            let credentials: GithubSecrets = serde_json::from_str(&secrets)
                .map_err(|_| "GitHub 凭据格式无效，请重新保存".to_string())?;
            upload_github(&client, &config, &credentials, &object_key, bytes).await
        }
        "custom" => {
            let credentials: CustomSecrets = serde_json::from_str(&secrets)
                .map_err(|_| "自定义接口凭据格式无效，请重新保存".to_string())?;
            upload_custom(
                &client,
                &config,
                &credentials,
                &object_key,
                file_name,
                content_type,
                bytes,
            )
            .await
        }
        _ => Err("请先在图片设置中选择图床".to_string()),
    }
}

async fn upload_s3_compatible(
    client: &Client,
    config: &ImageHostConfig,
    credentials: &ObjectStoreSecrets,
    object_key: &str,
    content_type: &str,
    bytes: Vec<u8>,
) -> Result<UploadedImage, String> {
    require(&config.bucket, "Bucket")?;
    require(&config.region, "Region")?;
    require(&credentials.access_key_id, "Access Key ID")?;
    require(&credentials.secret_access_key, "Secret Access Key")?;
    let url = object_store_url(config, object_key)?;
    let host_name = url
        .host_str()
        .ok_or_else(|| "对象存储 Endpoint 缺少主机名".to_string())?;
    let host = url
        .port()
        .map(|port| format!("{host_name}:{port}"))
        .unwrap_or_else(|| host_name.to_string());
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date = now.format("%Y%m%d").to_string();
    let payload_hash = sha256_hex(&bytes);

    let mut signed_header_names =
        vec!["content-type", "host", "x-amz-content-sha256", "x-amz-date"];
    if !credentials.session_token.trim().is_empty() {
        signed_header_names.push("x-amz-security-token");
    }
    signed_header_names.sort_unstable();
    let signed_headers = signed_header_names.join(";");
    // canonical headers也必须与签名头名称同序。
    let canonical_headers = signed_header_names
        .iter()
        .map(|name| match *name {
            "content-type" => format!("content-type:{content_type}\n"),
            "host" => format!("host:{host}\n"),
            "x-amz-content-sha256" => format!("x-amz-content-sha256:{payload_hash}\n"),
            "x-amz-date" => format!("x-amz-date:{amz_date}\n"),
            "x-amz-security-token" => format!(
                "x-amz-security-token:{}\n",
                credentials.session_token.trim()
            ),
            _ => String::new(),
        })
        .collect::<String>();
    let canonical_request = format!(
        "PUT\n{}\n\n{}\n{}\n{}",
        url.path(),
        canonical_headers,
        signed_headers,
        payload_hash
    );
    let scope = format!("{date}/{}/s3/aws4_request", config.region.trim());
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        sha256_hex(canonical_request.as_bytes())
    );
    let date_key = hmac_sha256(
        format!("AWS4{}", credentials.secret_access_key.trim()).as_bytes(),
        date.as_bytes(),
    )?;
    let region_key = hmac_sha256(&date_key, config.region.trim().as_bytes())?;
    let service_key = hmac_sha256(&region_key, b"s3")?;
    let signing_key = hmac_sha256(&service_key, b"aws4_request")?;
    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes())?);
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
        credentials.access_key_id.trim()
    );

    let mut request = client
        .put(url.clone())
        .header(CONTENT_TYPE, content_type)
        .header("x-amz-content-sha256", payload_hash)
        .header("x-amz-date", amz_date)
        .header(AUTHORIZATION, authorization);
    if !credentials.session_token.trim().is_empty() {
        request = request.header("x-amz-security-token", credentials.session_token.trim());
    }
    let response = request
        .body(bytes)
        .send()
        .await
        .map_err(|error| format!("上传请求失败：{error}"))?;
    ensure_success(response, "对象存储上传").await?;

    Ok(UploadedImage {
        url: public_url(&config.public_base_url, object_key).unwrap_or_else(|_| url.to_string()),
        object_key: object_key.to_string(),
    })
}

async fn upload_github(
    client: &Client,
    config: &ImageHostConfig,
    credentials: &GithubSecrets,
    object_key: &str,
    bytes: Vec<u8>,
) -> Result<UploadedImage, String> {
    require(&config.github_owner, "仓库所有者")?;
    require(&config.github_repo, "仓库名称")?;
    require(&config.github_branch, "分支")?;
    require(&credentials.token, "GitHub Token")?;
    let mut api_url = Url::parse("https://api.github.com")
        .map_err(|error| format!("GitHub API 地址无效：{error}"))?;
    api_url.set_path(&format!(
        "/repos/{}/{}/contents/{}",
        config.github_owner.trim(),
        config.github_repo.trim(),
        object_key
    ));
    api_url
        .query_pairs_mut()
        .append_pair("ref", config.github_branch.trim());
    let headers = github_headers(&credentials.token)?;
    let existing = client
        .get(api_url.clone())
        .headers(headers.clone())
        .send()
        .await
        .map_err(|error| format!("GitHub 请求失败：{error}"))?;
    if existing.status() != StatusCode::OK && existing.status() != StatusCode::NOT_FOUND {
        return ensure_success(existing, "GitHub 文件检查")
            .await
            .map(|_| unreachable!());
    }
    if existing.status() == StatusCode::NOT_FOUND {
        let body = json!({
            "message": format!("Upload image via WenRender: {object_key}"),
            "content": BASE64.encode(bytes),
            "branch": config.github_branch.trim(),
        });
        let response = client
            .put(api_url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("GitHub 上传请求失败：{error}"))?;
        ensure_success(response, "GitHub 上传").await?;
    }
    let url = if config.public_base_url.trim().is_empty() {
        public_url(
            &format!(
                "https://raw.githubusercontent.com/{}/{}/{}",
                config.github_owner.trim(),
                config.github_repo.trim(),
                config.github_branch.trim()
            ),
            object_key,
        )?
    } else {
        public_url(&config.public_base_url, object_key)?
    };
    Ok(UploadedImage {
        url,
        object_key: object_key.to_string(),
    })
}

async fn upload_custom(
    client: &Client,
    config: &ImageHostConfig,
    credentials: &CustomSecrets,
    object_key: &str,
    file_name: &str,
    content_type: &str,
    bytes: Vec<u8>,
) -> Result<UploadedImage, String> {
    require(&config.endpoint, "上传接口地址")?;
    let hash = sha256_hex(&bytes);
    let endpoint = config
        .endpoint
        .replace("{filename}", &percent(file_name))
        .replace("{key}", &percent(object_key))
        .replace("{hash}", &hash);
    let mut headers = HeaderMap::new();
    for (name, value) in &credentials.headers {
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| format!("自定义请求头名称无效：{name}"))?;
        let value = HeaderValue::from_str(value)
            .map_err(|_| format!("自定义请求头值无效：{}", name.as_str()))?;
        headers.insert(name, value);
    }
    let request = if config.custom_method == "PUT" {
        client
            .put(endpoint)
            .headers(headers)
            .header(CONTENT_TYPE, content_type)
            .body(bytes)
    } else {
        let part = multipart::Part::bytes(bytes)
            .file_name(file_name.to_string())
            .mime_str(content_type)
            .map_err(|error| format!("图片 MIME 类型无效：{error}"))?;
        client.post(endpoint).headers(headers).multipart(
            multipart::Form::new().part(
                if config.custom_file_field.trim().is_empty() {
                    "file"
                } else {
                    config.custom_file_field.trim()
                }
                .to_string(),
                part,
            ),
        )
    };
    let response = request
        .send()
        .await
        .map_err(|error| format!("自定义上传请求失败：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("无法读取上传响应：{error}"))?;
    if !status.is_success() {
        return Err(format!(
            "自定义上传失败（HTTP {status}）：{}",
            truncate(&body)
        ));
    }
    let url = if config.custom_response_url_path.trim().is_empty() {
        body.trim().to_string()
    } else {
        let value: Value = serde_json::from_str(&body)
            .map_err(|error| format!("上传响应不是有效 JSON：{error}"))?;
        json_path(&value, config.custom_response_url_path.trim())
            .and_then(Value::as_str)
            .ok_or_else(|| {
                format!(
                    "响应中找不到 URL 字段：{}",
                    config.custom_response_url_path.trim()
                )
            })?
            .to_string()
    };
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("上传接口返回的图片地址必须是 HTTP 或 HTTPS URL".to_string());
    }
    Ok(UploadedImage {
        url,
        object_key: object_key.to_string(),
    })
}

fn object_store_url(config: &ImageHostConfig, object_key: &str) -> Result<Url, String> {
    let endpoint = if !config.endpoint.trim().is_empty() {
        config.endpoint.trim().trim_end_matches('/').to_string()
    } else {
        match config.provider.as_str() {
            "s3" => format!("https://s3.{}.amazonaws.com", config.region.trim()),
            "oss" => format!("https://oss-{}.aliyuncs.com", config.region.trim()),
            "cos" => format!("https://cos.{}.myqcloud.com", config.region.trim()),
            "r2" => return Err("R2 必须填写 S3 API Endpoint".to_string()),
            _ => return Err("对象存储 Endpoint 无效".to_string()),
        }
    };
    let mut url = Url::parse(&endpoint).map_err(|error| format!("Endpoint 无效：{error}"))?;
    if config.provider == "oss" || config.provider == "cos" {
        let host = url
            .host_str()
            .ok_or_else(|| "Endpoint 缺少主机名".to_string())?;
        url.set_host(Some(&format!("{}.{}", config.bucket.trim(), host)))
            .map_err(|_| "无法组合 Bucket 与 Endpoint".to_string())?;
        url.set_path(&format!("/{object_key}"));
    } else {
        let base_path = url.path().trim_end_matches('/');
        url.set_path(&format!(
            "{}/{}/{}",
            base_path,
            config.bucket.trim(),
            object_key
        ));
    }
    Ok(url)
}

fn github_headers(token: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", token.trim()))
            .map_err(|_| "GitHub Token 包含无效字符".to_string())?,
    );
    headers.insert(
        "accept",
        HeaderValue::from_static("application/vnd.github+json"),
    );
    headers.insert(
        "x-github-api-version",
        HeaderValue::from_static("2022-11-28"),
    );
    headers.insert(
        "user-agent",
        HeaderValue::from_static("WenRender-image-host"),
    );
    Ok(headers)
}

fn keyring_entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, provider)
        .map_err(|error| format!("无法访问系统密钥库：{error}"))
}

fn validate_provider(provider: &str) -> Result<(), String> {
    if matches!(provider, "s3" | "oss" | "cos" | "github" | "r2" | "custom") {
        Ok(())
    } else {
        Err("不支持的图床类型".to_string())
    }
}

fn provider_name(provider: &str) -> &str {
    match provider {
        "s3" => "S3",
        "oss" => "OSS",
        "cos" => "COS",
        "github" => "GitHub",
        "r2" => "R2",
        "custom" => "自定义接口",
        _ => "图床",
    }
}

fn require(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("请填写{label}"))
    } else {
        Ok(())
    }
}

fn object_key(prefix: &str, file_name: &str, bytes: &[u8]) -> String {
    let safe_name = file_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let digest = sha256_hex(bytes);
    let name = format!("{}-{}", &digest[..12], safe_name.trim_matches('-'));
    let prefix = prefix
        .trim()
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            segment
                .chars()
                .map(|character| {
                    if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                        character
                    } else {
                        '-'
                    }
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("/");
    if prefix.is_empty() {
        name
    } else {
        format!("{prefix}/{name}")
    }
}

fn image_content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    }
}

fn public_url(base: &str, object_key: &str) -> Result<String, String> {
    let mut url = Url::parse(&format!("{}/", base.trim().trim_end_matches('/')))
        .map_err(|error| format!("公开访问域名无效：{error}"))?;
    let path = format!("{}/{}", url.path().trim_end_matches('/'), object_key);
    url.set_path(&path);
    Ok(url.to_string())
}

fn percent(value: &str) -> String {
    utf8_percent_encode(value, PATH_ENCODE_SET).to_string()
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    let mut mac = HmacSha256::new_from_slice(key).map_err(|_| "无法初始化上传签名".to_string())?;
    mac.update(message);
    Ok(mac.finalize().into_bytes().to_vec())
}

async fn ensure_success(response: reqwest::Response, action: &str) -> Result<(), String> {
    let status = response.status();
    if status.is_success() {
        return Ok(());
    }
    let body = response.text().await.unwrap_or_default();
    Err(format!(
        "{action}失败（HTTP {status}）：{}",
        truncate(&body)
    ))
}

fn truncate(value: &str) -> String {
    value.chars().take(500).collect()
}

fn json_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    path.split('.')
        .filter(|part| !part.is_empty())
        .try_fold(value, |current, part| current.get(part))
}

#[cfg(test)]
mod tests {
    use super::{json_path, object_key};
    use serde_json::json;

    #[test]
    fn object_keys_are_stable_and_prefixed() {
        let first = object_key("articles/images", "示例 image.png", b"same");
        let second = object_key("articles/images", "示例 image.png", b"same");
        assert_eq!(first, second);
        assert!(first.starts_with("articles/images/"));
        assert!(first.ends_with(".png"));
    }

    #[test]
    fn reads_nested_custom_response_url() {
        let response = json!({"data": {"url": "https://example.com/a.png"}});
        assert_eq!(
            json_path(&response, "data.url").and_then(|value| value.as_str()),
            Some("https://example.com/a.png")
        );
    }
}
