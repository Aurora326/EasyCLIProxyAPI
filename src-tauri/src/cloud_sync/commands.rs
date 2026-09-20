use super::crypto::{decrypt_payload, encrypt_payload};
use super::s3_client::{R2SyncSettings, S3Client};
use super::snapshot::{
    build_snapshot, load_sync_settings, restore_snapshot, save_sync_settings, SyncResult,
    SyncSnapshot,
};
use chrono::Utc;

#[tauri::command]
pub(crate) async fn test_r2_sync_connection(settings: R2SyncSettings) -> Result<String, String> {
    let client = S3Client::new(settings)?;
    client.test_connection().await
}

#[tauri::command]
pub(crate) async fn push_config_to_r2(settings: R2SyncSettings) -> Result<SyncResult, String> {
    if settings.master_password.trim().is_empty() {
        return Err("端到端加密主密码 (Master Password) 不能为空".to_string());
    }

    let snapshot = build_snapshot(&settings)?;
    let plaintext = serde_json::to_vec(&snapshot)
        .map_err(|e| format!("快照序列化失败: {e}"))?;

    let encrypted = encrypt_payload(&plaintext, settings.master_password.trim())?;

    let client = S3Client::new(settings.clone())?;
    client.put_object(&encrypted).await?;

    // 保存设置（记住端点等参数，但用户可自由控制是否保留密码）
    let _ = save_sync_settings(&settings);

    let now_iso = Utc::now().to_rfc3339();
    Ok(SyncResult {
        success: true,
        message: format!("已成功将配置加密并推送至 Cloudflare R2（设备: {}）", snapshot.device_name),
        timestamp: now_iso,
        file_count: 3,
    })
}

#[tauri::command]
pub(crate) async fn pull_config_from_r2(settings: R2SyncSettings) -> Result<SyncResult, String> {
    if settings.master_password.trim().is_empty() {
        return Err("端到端解密主密码 (Master Password) 不能为空".to_string());
    }

    let client = S3Client::new(settings.clone())?;
    let encrypted = client.get_object().await?;

    let decrypted = decrypt_payload(&encrypted, settings.master_password.trim())?;
    let snapshot: SyncSnapshot = serde_json::from_slice(&decrypted)
        .map_err(|e| format!("云端数据解析失败: {e}"))?;

    let restored_count = restore_snapshot(&snapshot, &settings)?;

    let _ = save_sync_settings(&settings);

    let now_iso = Utc::now().to_rfc3339();
    Ok(SyncResult {
        success: true,
        message: format!(
            "已成功从 Cloudflare R2 拉取并还原配置（来源设备: {}，创建时间: {}，恢复文件数: {}）",
            snapshot.device_name, snapshot.created_at, restored_count
        ),
        timestamp: now_iso,
        file_count: restored_count,
    })
}

#[tauri::command]
pub(crate) fn get_r2_sync_settings() -> Result<R2SyncSettings, String> {
    load_sync_settings()
}

#[tauri::command]
pub(crate) fn save_r2_sync_settings_cmd(settings: R2SyncSettings) -> Result<(), String> {
    save_sync_settings(&settings)
}

#[tauri::command]
pub(crate) async fn get_r2_cloud_status(settings: R2SyncSettings) -> Result<Option<String>, String> {
    if settings.endpoint.trim().is_empty() || settings.bucket.trim().is_empty() {
        return Ok(None);
    }
    let client = S3Client::new(settings)?;
    client.get_object_metadata().await
}
