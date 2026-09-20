use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::time::Duration;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct R2SyncSettings {
    pub(crate) endpoint: String,
    pub(crate) bucket: String,
    pub(crate) region: String,
    pub(crate) access_key_id: String,
    pub(crate) secret_access_key: String,
    pub(crate) object_key: String,
    pub(crate) master_password: String,
    pub(crate) auto_sync: bool,
    pub(crate) include_api_keys: bool,
    pub(crate) include_agents: bool,
    pub(crate) include_aliases: bool,
    pub(crate) include_oauth_files: bool,
}

impl Default for R2SyncSettings {
    fn default() -> Self {
        Self {
            endpoint: String::new(),
            bucket: String::new(),
            region: "auto".to_string(),
            access_key_id: String::new(),
            secret_access_key: String::new(),
            object_key: "easy-cliproxy-sync.enc".to_string(),
            master_password: String::new(),
            auto_sync: false,
            include_api_keys: false,
            include_agents: true,
            include_aliases: true,
            include_oauth_files: true,
        }
    }
}

pub(crate) struct S3Client {
    settings: R2SyncSettings,
    http_client: reqwest::Client,
}

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

impl S3Client {
    pub(crate) fn new(settings: R2SyncSettings) -> Result<Self, String> {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("初始化网络客户端失败: {e}"))?;

        Ok(Self {
            settings,
            http_client,
        })
    }

    fn clean_endpoint(&self) -> Result<String, String> {
        let trimmed = self.settings.endpoint.trim().trim_end_matches('/');
        if trimmed.is_empty() {
            return Err("S3/R2 Endpoint 端点不能为空".to_string());
        }
        let url = if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
            format!("https://{trimmed}")
        } else {
            trimmed.to_string()
        };
        Ok(url)
    }

    fn sign_request(
        &self,
        method: &str,
        url: &str,
        payload: &[u8],
    ) -> Result<HeaderMap, String> {
        let parsed_url = reqwest::Url::parse(url).map_err(|e| format!("无效的 URL: {e}"))?;
        let host = parsed_url
            .host_str()
            .ok_or_else(|| "URL 缺少 Host".to_string())?;

        let now = Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = now.format("%Y%m%d").to_string();

        let region = if self.settings.region.trim().is_empty() {
            "auto"
        } else {
            self.settings.region.trim()
        };
        let service = "s3";
        let payload_hash = sha256_hex(payload);

        let canonical_uri = parsed_url.path();
        let canonical_querystring = parsed_url.query().unwrap_or("");

        // 规范请求头按小写排序
        let mut canonical_headers = BTreeMap::new();
        canonical_headers.insert("host", host.to_string());
        canonical_headers.insert("x-amz-content-sha256", payload_hash.clone());
        canonical_headers.insert("x-amz-date", amz_date.clone());

        let signed_headers = canonical_headers
            .keys()
            .cloned()
            .collect::<Vec<_>>()
            .join(";");

        let canonical_headers_str = canonical_headers
            .iter()
            .map(|(k, v)| format!("{k}:{v}\n"))
            .collect::<String>();

        let canonical_request = format!(
            "{method}\n{canonical_uri}\n{canonical_querystring}\n{canonical_headers_str}{signed_headers}\n{payload_hash}"
        );

        let credential_scope = format!("{date_stamp}/{region}/{service}/aws4_request");
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{}",
            sha256_hex(canonical_request.as_bytes())
        );

        // 计算 Signing Key
        let k_secret = format!("AWS4{}", self.settings.secret_access_key.trim());
        let k_date = hmac_sha256(k_secret.as_bytes(), date_stamp.as_bytes());
        let k_region = hmac_sha256(&k_date, region.as_bytes());
        let k_service = hmac_sha256(&k_region, service.as_bytes());
        let k_signing = hmac_sha256(&k_service, b"aws4_request");

        let signature = hex::encode(hmac_sha256(&k_signing, string_to_sign.as_bytes()));

        let authorization = format!(
            "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            self.settings.access_key_id.trim(),
            credential_scope,
            signed_headers,
            signature
        );

        let mut headers = HeaderMap::new();
        headers.insert(
            HeaderName::from_static("x-amz-date"),
            HeaderValue::from_str(&amz_date).map_err(|e| e.to_string())?,
        );
        headers.insert(
            HeaderName::from_static("x-amz-content-sha256"),
            HeaderValue::from_str(&payload_hash).map_err(|e| e.to_string())?,
        );
        headers.insert(
            HeaderName::from_static("authorization"),
            HeaderValue::from_str(&authorization).map_err(|e| e.to_string())?,
        );

        Ok(headers)
    }

    pub(crate) async fn test_connection(&self) -> Result<String, String> {
        let base = self.clean_endpoint()?;
        let bucket = self.settings.bucket.trim();
        if bucket.is_empty() {
            return Err("存储桶名称 (Bucket Name) 不能为空".to_string());
        }

        // 使用 HEAD 检测存储桶连通性
        let url = format!("{base}/{bucket}");
        let headers = self.sign_request("HEAD", &url, b"")?;

        let res = self
            .http_client
            .head(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("无法连接 Cloudflare R2: {e}"))?;

        let status = res.status();
        if status.is_success() || status.as_u16() == 200 {
            Ok("连接成功！R2 存储桶可正常访问".to_string())
        } else if status.as_u16() == 401 {
            Err("连接失败 (401 Unauthorized)：Cloudflare 拒绝鉴权。建议：1) 在 Cloudflare 创建令牌时权限选择「管理员读写 (Admin Read & Write)」；2) 新令牌全球节点广播生效需 1~3 分钟；3) 检查存储桶名是否有多余空格。".to_string())
        } else if status.as_u16() == 403 {
            Err("连接失败 (403 Forbidden)：Access Key ID 或 Secret Access Key 无权访问该存储桶".to_string())
        } else if status.as_u16() == 404 {
            Err("连接失败 (404 Not Found)：指定的存储桶不存在，请在 Cloudflare 控制台确认桶名".to_string())
        } else {
            Err(format!("Cloudflare R2 返回状态异常: {status}"))
        }
    }

    pub(crate) async fn put_object(&self, data: &[u8]) -> Result<(), String> {
        let base = self.clean_endpoint()?;
        let bucket = self.settings.bucket.trim();
        let key = self.settings.object_key.trim();
        if bucket.is_empty() || key.is_empty() {
            return Err("存储桶或目标对象名不能为空".to_string());
        }

        let url = format!("{base}/{bucket}/{key}");
        let mut headers = self.sign_request("PUT", &url, data)?;
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            HeaderValue::from_static("application/octet-stream"),
        );

        let res = self
            .http_client
            .put(&url)
            .headers(headers)
            .body(data.to_vec())
            .send()
            .await
            .map_err(|e| format!("上传至 R2 失败: {e}"))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(format!("上传失败 ({status}): {body}"));
        }

        Ok(())
    }

    pub(crate) async fn get_object(&self) -> Result<Vec<u8>, String> {
        let base = self.clean_endpoint()?;
        let bucket = self.settings.bucket.trim();
        let key = self.settings.object_key.trim();
        if bucket.is_empty() || key.is_empty() {
            return Err("存储桶或目标对象名不能为空".to_string());
        }

        let url = format!("{base}/{bucket}/{key}");
        let headers = self.sign_request("GET", &url, b"")?;

        let res = self
            .http_client
            .get(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("从 R2 拉取数据失败: {e}"))?;

        if res.status().as_u16() == 404 {
            return Err("云端暂未发现备份文件，请先在一台设备上执行「推送配置到云端」".to_string());
        }

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(format!("拉取失败 ({status}): {body}"));
        }

        let bytes = res.bytes().await.map_err(|e| format!("读取云端数据失败: {e}"))?;
        Ok(bytes.to_vec())
    }

    pub(crate) async fn get_object_metadata(&self) -> Result<Option<String>, String> {
        let base = self.clean_endpoint()?;
        let bucket = self.settings.bucket.trim();
        let key = self.settings.object_key.trim();
        if bucket.is_empty() || key.is_empty() {
            return Ok(None);
        }

        let url = format!("{base}/{bucket}/{key}");
        let headers = self.sign_request("HEAD", &url, b"")?;

        let res = self
            .http_client
            .head(&url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("查询云端元数据失败: {e}"))?;

        if res.status().is_success() {
            let last_modified = res
                .headers()
                .get("last-modified")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            Ok(Some(last_modified))
        } else {
            Ok(None)
        }
    }
}
