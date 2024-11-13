use anyhow::{anyhow, Result};
use reqwest::blocking::Client;
use reqwest::Certificate;
use sha2::{Digest, Sha256};
use std::fs::{read, File};
use std::io::Write;

/// Helper function to download a Python script from GitHub, calculate its hash, and verify integrity
pub fn verify_and_download_python_github(
    github_url: &str,
    save_path: &str,
    expected_hash: &str,
) -> Result<()> {

    // Convert the GitHub URL to the raw URL
    let raw_url = github_url
        .replace("https://github.com", "https://raw.githubusercontent.com")
        .replace("/blob/", "/");

    // Read the CA certificates for HTTPS
    let ca_bundle = read("/etc/ssl/certs/ca-certificates.crt")
        .map_err(|e| anyhow!("Failed to read CA certificates: {}", e))?;
    let ca_cert = Certificate::from_pem(&ca_bundle)
        .map_err(|e| anyhow!("Failed to create certificate from PEM: {}", e))?;

    // Build the HTTP client
    let client = Client::builder()
        .use_rustls_tls()
        .add_root_certificate(ca_cert)
        .build()
        .map_err(|e| anyhow!("Failed to build HTTP client: {}", e))?;

    // Fetch the script
    let response = client
        .get(raw_url.clone())
        .send()
        .map_err(|e| anyhow!("HTTP GET request failed: {}", e))?
        .text()
        .map_err(|e| anyhow!("Failed to read response text: {}", e))?;

    // Calculate SHA256 hash
    let mut hasher = Sha256::new();
    hasher.update(&response);
    let hash = hasher.finalize();
    let hash_hex = format!("{:x}", hash);

    // Verify the hash
    if hash_hex != expected_hash {
        return Err(anyhow!(
            "Hash verification failed for '{}'. Expected: {}, Found: {}",
            raw_url,
            expected_hash,
            hash_hex
        ));
    }

    // Save the script to the specified path
    let mut file = File::create(save_path)
        .map_err(|e| anyhow!("Failed to create file '{}': {}", save_path, e))?;
    file.write_all(response.as_bytes())
        .map_err(|e| anyhow!("Failed to write to file '{}': {}", save_path, e))?;

    Ok(())
}

/// Helper function to download a WASM binary from GitHub, calculate its hash, and verify integrity
pub fn verify_and_download_wasm(
    github_url: &str,
    save_path: &str,
    expected_hash: &str,
) -> Result<()> {

    // Convert the GitHub URL to the raw URL
    let raw_url = github_url
        .replace("https://github.com", "https://raw.githubusercontent.com")
        .replace("/blob/", "/");

    // Read the CA certificates for HTTPS
    let ca_bundle = read("/etc/ssl/certs/ca-certificates.crt")
        .map_err(|e| anyhow!("Failed to read CA certificates: {}", e))?;
    let ca_cert = Certificate::from_pem(&ca_bundle)
        .map_err(|e| anyhow!("Failed to create certificate from PEM: {}", e))?;

    // Build the HTTP client
    let client = Client::builder()
        .use_rustls_tls()
        .add_root_certificate(ca_cert)
        .build()
        .map_err(|e| anyhow!("Failed to build HTTP client: {}", e))?;

    // Fetch the script
    let response = client
        .get(&raw_url.clone())
        .send()
        .map_err(|e| anyhow!("HTTP GET request failed: {}", e))?
        .bytes()
        .map_err(|e| anyhow!("Failed to read response bytes: {}", e))?;

    // Calculate SHA256 hash
    let mut hasher = Sha256::new();
    hasher.update(&response);
    let hash = hasher.finalize();
    let hash_hex = format!("{:x}", hash);

    // Verify the hash
    if hash_hex != expected_hash {
        return Err(anyhow!(
            "Hash verification failed for '{}'. Expected: {}, Found: {}",
            raw_url,
            expected_hash,
            hash_hex
        ));
    }

    // Save the WASM binary to the specified path
    let mut file = File::create(save_path)
        .map_err(|e| anyhow!("Failed to create file '{}': {}", save_path, e))?;
    file.write_all(&response)
        .map_err(|e| anyhow!("Failed to write to file '{}': {}", save_path, e))?;

    Ok(())
}