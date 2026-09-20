use super::s3_client::R2SyncSettings;
use crate::core_runtime::core_base_dir;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const SNAPSHOT_VERSION: u32 = 1;
const SYNC_SETTINGS_FILE: &str = "cpa-r2-sync.json";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SyncSnapshot {
    pub(crate) version: u32,
    pub(crate) created_at: String,
    pub(crate) device_name: String,
    pub(crate) app_version: String,
    pub(crate) config_yaml: Option<String>,
    pub(crate) agents_yaml: Option<String>,
    pub(crate) gui_config_json: Option<String>,
    pub(crate) oauth_files: Option<std::collections::HashMap<String, String>>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SyncResult {
    pub(crate) success: bool,
    pub(crate) message: String,
    pub(crate) timestamp: String,
    pub(crate) file_count: usize,
}

fn sync_settings_path() -> Result<PathBuf, String> {
    Ok(core_base_dir()?.join(SYNC_SETTINGS_FILE))
}

pub(crate) fn load_sync_settings() -> Result<R2SyncSettings, String> {
    let path = sync_settings_path()?;
    if !path.exists() {
        return Ok(R2SyncSettings::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取云同步配置文件失败: {e}"))?;
    let settings: R2SyncSettings = serde_json::from_str(&content)
        .unwrap_or_default();
    Ok(settings)
}

pub(crate) fn save_sync_settings(settings: &R2SyncSettings) -> Result<(), String> {
    let path = sync_settings_path()?;
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("序列化云同步配置失败: {e}"))?;
    fs::write(&path, content)
        .map_err(|e| format!("写入云同步配置文件失败: {e}"))?;
    Ok(())
}

pub(crate) fn build_snapshot(settings: &R2SyncSettings) -> Result<SyncSnapshot, String> {
    let base = core_base_dir()?;
    let core_dir = base.join("cpa-core");

    let mut config_yaml_str = None;
    let config_path = core_dir.join("config.yaml");
    if config_path.exists() {
        if let Ok(mut text) = fs::read_to_string(&config_path) {
            // 如果用户选择不包含敏感 API Key，做脱敏替换
            if !settings.include_api_keys {
                if let Ok(mut yaml_val) = serde_yaml::from_str::<serde_yaml::Value>(&text) {
                    if let Some(mapping) = yaml_val.as_mapping_mut() {
                        let key_ident = serde_yaml::Value::String("api-keys".to_string());
                        if mapping.contains_key(&key_ident) {
                            mapping.insert(key_ident, serde_yaml::Value::Sequence(Vec::new()));
                            if let Ok(sanitized) = serde_yaml::to_string(&yaml_val) {
                                text = sanitized;
                            }
                        }
                    }
                }
            }
            config_yaml_str = Some(text);
        }
    }

    let mut agents_yaml_str = None;
    if settings.include_agents {
        let agents_path = core_dir.join("agents.yaml");
        if agents_path.exists() {
            if let Ok(text) = fs::read_to_string(&agents_path) {
                agents_yaml_str = Some(text);
            }
        }
    }

    let mut gui_json_str = None;
    let gui_path = base.join("cpa-gui.json");
    if gui_path.exists() {
        if let Ok(text) = fs::read_to_string(&gui_path) {
            gui_json_str = Some(text);
        }
    }

    let mut oauth_files_map = None;
    if settings.include_oauth_files {
        let oauth_dir = base.join("oauth");
        if oauth_dir.exists() && oauth_dir.is_dir() {
            let mut map = std::collections::HashMap::new();
            if let Ok(entries) = fs::read_dir(&oauth_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                        if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
                            if let Ok(content) = fs::read_to_string(&path) {
                                map.insert(file_name.to_string(), content);
                            }
                        }
                    }
                }
            }
            if !map.is_empty() {
                oauth_files_map = Some(map);
            }
        }
    }

    let device_name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Desktop-Client".to_string());

    Ok(SyncSnapshot {
        version: SNAPSHOT_VERSION,
        created_at: Utc::now().to_rfc3339(),
        device_name,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        config_yaml: config_yaml_str,
        agents_yaml: agents_yaml_str,
        gui_config_json: gui_json_str,
        oauth_files: oauth_files_map,
    })
}

pub(crate) fn restore_snapshot(snapshot: &SyncSnapshot, settings: &R2SyncSettings) -> Result<usize, String> {
    let base = core_base_dir()?;
    let core_dir = base.join("cpa-core");

    if !core_dir.exists() {
        fs::create_dir_all(&core_dir)
            .map_err(|e| format!("创建 cpa-core 目录失败: {e}"))?;
    }

    let mut restored_count = 0;

    if let Some(ref config_yaml) = snapshot.config_yaml {
        let config_path = core_dir.join("config.yaml");
        // 备份旧配置
        if config_path.exists() {
            let backup_path = core_dir.join(format!("config.yaml.bak-{}", Utc::now().format("%Y%m%d%H%M%S")));
            let _ = fs::copy(&config_path, backup_path);
        }
        fs::write(&config_path, config_yaml)
            .map_err(|e| format!("恢复 config.yaml 失败: {e}"))?;
        restored_count += 1;
    }

    if settings.include_agents {
        if let Some(ref agents_yaml) = snapshot.agents_yaml {
            let agents_path = core_dir.join("agents.yaml");
            fs::write(&agents_path, agents_yaml)
                .map_err(|e| format!("恢复 agents.yaml 失败: {e}"))?;
            restored_count += 1;
        }
    }

    if let Some(ref gui_json) = snapshot.gui_config_json {
        let gui_path = base.join("cpa-gui.json");
        fs::write(&gui_path, gui_json)
            .map_err(|e| format!("恢复 cpa-gui.json 失败: {e}"))?;
        restored_count += 1;
    }

    if settings.include_oauth_files {
        if let Some(ref oauth_files) = snapshot.oauth_files {
            let oauth_dir = base.join("oauth");
            if !oauth_dir.exists() {
                let _ = fs::create_dir_all(&oauth_dir);
            }
            for (file_name, content) in oauth_files {
                if !file_name.contains('/') && !file_name.contains('\\') && file_name.ends_with(".json") {
                    let target_path = oauth_dir.join(file_name);
                    let _ = fs::write(&target_path, content);
                    restored_count += 1;
                }
            }
        }
    }

    Ok(restored_count)
}
