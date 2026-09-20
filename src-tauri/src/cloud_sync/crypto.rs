use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use sha2::Sha256;

const MAGIC_HEADER: &[u8; 4] = b"CPAS"; // CPA Sync Magic
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const PBKDF2_ROUNDS: u32 = 100_000;

pub(crate) fn encrypt_payload(plaintext: &[u8], password: &str) -> Result<Vec<u8>, String> {
    if password.is_empty() {
        return Err("加密密码不能为空".to_string());
    }

    let mut salt = [0u8; SALT_LEN];
    getrandom::fill(&mut salt).map_err(|e| format!("生成随机盐失败: {e}"))?;

    let mut key = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, PBKDF2_ROUNDS, &mut key);

    let mut nonce_bytes = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce_bytes).map_err(|e| format!("生成随机 Nonce 失败: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("初始化 AES 引擎失败: {e}"))?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("数据加密失败: {e}"))?;

    let mut output = Vec::with_capacity(MAGIC_HEADER.len() + SALT_LEN + NONCE_LEN + ciphertext.len());
    output.extend_from_slice(MAGIC_HEADER);
    output.extend_from_slice(&salt);
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);

    Ok(output)
}

pub(crate) fn decrypt_payload(encrypted_data: &[u8], password: &str) -> Result<Vec<u8>, String> {
    if password.is_empty() {
        return Err("解密密码不能为空".to_string());
    }

    let min_len = MAGIC_HEADER.len() + SALT_LEN + NONCE_LEN + 16; // 16 bytes auth tag
    if encrypted_data.len() < min_len {
        return Err("云端备份数据损坏或格式不正确".to_string());
    }

    if &encrypted_data[0..4] != MAGIC_HEADER {
        return Err("云端备份数据签名无效或非 EasyCLIProxyAPI 密文".to_string());
    }

    let salt = &encrypted_data[4..4 + SALT_LEN];
    let nonce_bytes = &encrypted_data[4 + SALT_LEN..4 + SALT_LEN + NONCE_LEN];
    let ciphertext = &encrypted_data[4 + SALT_LEN + NONCE_LEN..];

    let mut key = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ROUNDS, &mut key);

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("初始化 AES 引擎失败: {e}"))?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "解密失败：主口令密码错误，或数据已被篡改".to_string())?;

    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encryption_roundtrip() {
        let secret = "MySuperSecurePassword123!";
        let data = b"{\"hello\": \"world\", \"config\": 42}";

        let encrypted = encrypt_payload(data, secret).expect("encrypt");
        assert_ne!(encrypted, data);

        let decrypted = decrypt_payload(&encrypted, secret).expect("decrypt");
        assert_eq!(decrypted, data);

        // 密码错误应返回失败
        assert!(decrypt_payload(&encrypted, "wrong-password").is_err());
    }
}
