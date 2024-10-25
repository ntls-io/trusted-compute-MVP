use reqwest;
use reqwest::Certificate;
use reqwest::blocking::Client;
use std::error::Error;
use anyhow;
use sha2::{Sha256, Digest};
use std::fs::{File, read};
use std::io::Write;


/// Helper function to download a Python script from GitHub, calculate its hash, and verify integrity
pub fn verify_and_download_python(base_url: &str, file_name: &str, save_path: &str, expected_hash: &str) -> Result<(), Box<dyn Error>> {
    let url = format!("{}{}", base_url, file_name);

    let ca_bundle = read("/etc/ssl/certs/ca-certificates.crt")?;
    let ca_cert = Certificate::from_pem(&ca_bundle)?;

    let client = Client::builder()
        .use_rustls_tls()
        .add_root_certificate(ca_cert)
        .build()?;
    
    let response = client.get(&url).send()?.text()?;

    // Calculate SHA256 hash
    let mut hasher = Sha256::new();
    hasher.update(&response);
    let hash = hasher.finalize();
    let hash_hex = format!("{:x}", hash);
    
    // Verify hash
    if hash_hex != expected_hash {
        return Err(anyhow::anyhow!("Hash verification failed for '{}'. Expected: {}, Found: {}", file_name, expected_hash, hash_hex).into());
    }
    println!("[+] Hash verified successfully for '{}'", file_name);

    let mut file = File::create(save_path)?;
    file.write_all(response.as_bytes())?;
    println!("[+] Downloaded and saved '{}'", file_name);

    Ok(())
}

/// Helper function to download a WASM binary from GitHub, calculate its hash, and verify integrity
pub fn verify_and_download_wasm(base_url: &str, file_name: &str, save_path: &str, expected_hash: &str) -> Result<(), Box<dyn Error>> {
    let url = format!("{}{}", base_url, file_name);

    let ca_bundle = read("/etc/ssl/certs/ca-certificates.crt")?;
    let ca_cert = Certificate::from_pem(&ca_bundle)?;

    let client = Client::builder()
        .use_rustls_tls()
        .add_root_certificate(ca_cert)
        .build()?;

    let response = client.get(&url).send()?.bytes()?;

    // Calculate SHA256 hash
    let mut hasher = Sha256::new();
    hasher.update(&response);
    let hash = hasher.finalize();
    let hash_hex = format!("{:x}", hash);

    // Verify hash
    if hash_hex != expected_hash {
        return Err(anyhow::anyhow!("Hash verification failed for '{}'. Expected: {}, Found: {}", file_name, expected_hash, hash_hex).into());
    }
    println!("[+] Hash verified successfully for '{}'", file_name);

    let mut file = File::create(save_path)?;
    file.write_all(&response)?;
    println!("[+] Downloaded and saved '{}'", file_name);

    Ok(())
}
