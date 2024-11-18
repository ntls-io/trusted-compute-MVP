extern crate github_download;
extern crate json_append;
extern crate python_rust_impl;
extern crate wasmi_impl;

use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use anyhow::{anyhow, Result};
use github_download::{verify_and_download_python_github, verify_and_download_wasm};
use json_append::append_json;
use python_rust_impl::run_python;
use serde_json::Value;
use std::fs::{read, File};
use std::io::Write;
use wasmi_impl::wasm_execution;
use serde::Deserialize;
use aes_gcm::{Aes128Gcm, KeyInit, Nonce}; // AES-GCM for encryption
use aes_gcm::aead::Aead;
use rand::RngCore;
use hkdf::Hkdf;
use sha2::Sha256;

// Define a health check route
async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("Server is running")
}

/// Derives a new key using HKDF with a given base key, salt, and purpose.
fn derive_key(base_key: &[u8], salt: &[u8]) -> Result<[u8; 16]> {
    let hkdf = Hkdf::<Sha256>::new(Some(salt), base_key);
    let mut derived_key = [0u8; 16];
    hkdf.expand(b"sealing", &mut derived_key)
        .map_err(|e| anyhow!("Key derivation failed: {}", e))?;
    Ok(derived_key)
}

/// Generates a 16-byte random salt.
fn generate_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    salt
}

/// Reads the attestation key and derives the encryption key using a salt.
fn read_and_derive_key(salt: &[u8]) -> Result<[u8; 16]> {
    let base_key = read("/dev/attestation/keys/_sgx_mrenclave").map_err(|e| anyhow!("Failed to read key: {}", e))?;
    if base_key.len() != 16 {
        return Err(anyhow!("Invalid key length: expected 16 bytes, got {}", base_key.len()));
    }
    derive_key(&base_key, salt)
}

/// Encrypts and seals the data.
fn seal_data(data: &Value, salt: Option<&[u8]>) -> Result<Vec<u8>> {
    // Generate or use the provided salt
    let salt = match salt {
        Some(existing_salt) => existing_salt.to_vec(),
        None => generate_salt().to_vec(),
    };

    // Derive the encryption key
    let derived_key = read_and_derive_key(&salt)?;
    let cipher = Aes128Gcm::new_from_slice(&derived_key).map_err(|e| anyhow!("Failed to initialize AES-GCM: {}", e))?;

    // Generate a secure nonce (12 bytes as required by AES-GCM)
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Serialize the data to JSON
    let serialized_data = serde_json::to_vec(data).map_err(|e| anyhow!("Failed to serialize JSON: {}", e))?;

    // Encrypt the serialized data
    let ciphertext = cipher
        .encrypt(nonce, serialized_data.as_ref())
        .map_err(|e| anyhow!("Encryption failed: {}", e))?;

    // Combine salt, nonce, and ciphertext into a single Vec<u8>
    let mut sealed_data = Vec::with_capacity(salt.len() + nonce_bytes.len() + ciphertext.len());
    sealed_data.extend_from_slice(&salt);
    sealed_data.extend_from_slice(&nonce_bytes);
    sealed_data.extend_from_slice(&ciphertext);

    Ok(sealed_data)
}

/// Saves data to a file.
fn save_to_file(data: &[u8]) -> Result<()> {
    let mut file = File::create("/data/data_pool").map_err(|e| anyhow!("Failed to create file: {}", e))?;
    file.write_all(data).map_err(|e| anyhow!("Failed to write to file: {}", e))?;
    Ok(())
}

// TODO Update threading
#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    println!("[+] Enclave created successfully, starting server...");

    // Start the Actix Web server
    HttpServer::new(|| {
        App::new()
        .route("/health", web::get().to(health_check)) // Health check route
        .route("/execute_python", web::post().to(execute_python_handler)) // Python execution route
        .route("/execute_wasm", web::post().to(execute_wasm_handler)) // WASM execution route
        .route("/create_data_pool", web::post().to(create_data_pool_handler)) // Create new data pool
        .route("/view_data", web::get().to(view_data_handler)) // View decrypted data, remove in production
        .route("/append_data", web::post().to(append_data_handler)) // Append data into data pool
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
    .map_err(|e| anyhow!("Actix web server error: {}", e))
}


/// Request structure for the `append_data` API
#[derive(Deserialize)]
struct AppendDataRequest {
    data: Value, // JSON data to append
}

/// Handler for the `append_data` API
async fn append_data_handler(body: web::Json<AppendDataRequest>) -> impl Responder {
    
    // TODO: Verify DRT redemption

    // Unseal the existing data
    let unsealed_data = match unseal_data() {
        Ok(data) => data,
        Err(e) => {
            eprintln!("[!] Error unsealing data: {}", e);
            return HttpResponse::InternalServerError().body("Failed to unseal data");
        }
    };

    // Append the new data to the unsealed data
    let updated_data = match append_json(&unsealed_data, &body.data) {
        Ok(data) => data,
        Err(e) => {
            eprintln!("[!] Error appending JSON: {}", e);
            return HttpResponse::InternalServerError().body("Failed to append data");
        }
    };

    // Seal the updated data
    let sealed_data = match seal_data(&updated_data, None) {
        Ok(data) => data,
        Err(e) => {
            eprintln!("[!] Error sealing data: {}", e);
            return HttpResponse::InternalServerError().body("Failed to seal data");
        }
    };    

    // TODO save to IPFS or other cloud storage
    // Save the sealed data back to the file
    if let Err(e) = save_to_file(&sealed_data) {
        eprintln!("[!] Error saving sealed data: {}", e);
        return HttpResponse::InternalServerError().body("Failed to save sealed data");
    }    

    HttpResponse::Ok().body("Data appended, sealed, and saved successfully")
}

/// Request structure for the `create_data_pool` API
#[derive(Deserialize)]
struct CreateDataPoolRequest {
    data: Value, // JSON data to be sealed
}

/// Handler for the `create_data_pool` API
async fn create_data_pool_handler(body: web::Json<CreateDataPoolRequest>) -> impl Responder {
    
    // TODO DRT redemption verification

    let sealed_data = match seal_data(&body.data, None) {
        Ok(data) => data,
        Err(e) => {
            eprintln!("[!] Error sealing data: {}", e);
            return HttpResponse::InternalServerError().body("Failed to seal data");
        }
    };

    // TODO save to IPFS or other cloud storage
    // Save the sealed data to the specified path
    if let Err(e) = save_to_file(&sealed_data) {
        eprintln!("[!] Error saving sealed data: {}", e);
        return HttpResponse::InternalServerError().body("Failed to save sealed data");
    }    

    HttpResponse::Ok().body("Data pool created, sealed, and saved successfully")
}

/// Structure to deserialize incoming API requests
#[derive(Deserialize)]
struct ExecuteWasmRequest {
    github_url: String,      // GitHub URL to the WASM binary
    expected_hash: String,   // Expected SHA256 hash of the WASM binary
    json_schema: Value,      // JSON schema for the input data
}

/// Handler for the `execute_wasm` API
async fn execute_wasm_handler(body: web::Json<ExecuteWasmRequest>) -> impl Responder {
    let github_url = &body.github_url;
    let expected_hash = &body.expected_hash;
    let json_schema = &body.json_schema;

    // Unseal the data pool
    match unseal_data() {
        Ok(json_data) => {
            match execute_wasm_binary(github_url, expected_hash, &json_data, json_schema) {
                Ok(result) => HttpResponse::Ok().json(result), // Return successful result
                Err(e) => {
                    eprintln!("[!] Error executing WASM binary: {}", e);
                    HttpResponse::InternalServerError()
                        .body(format!("WASM execution error: {}", e)) // Return detailed error
                }
            }
        }
        Err(e) => {
            eprintln!("[!] Error unsealing data: {}", e);
            HttpResponse::InternalServerError().body("Failed to unseal data")
        }
    }
}

fn execute_wasm_binary(
    github_url: &str,
    expected_hash: &str,
    input_data: &Value,
    input_schema: &Value,
) -> Result<Value> {
    // Temporary path to save the downloaded WASM binary
    let wasm_path = "/tmp/downloaded_wasm.wasm";

    // Step 1: Download and verify the WASM binary
    verify_and_download_wasm(&github_url, wasm_path, expected_hash)
        .map_err(|e| anyhow!("Failed to download or verify WASM binary: {}", e))?;

    // Step 2: Execute the WASM binary with the data and schema
    let result = match wasm_execution(wasm_path, input_data.clone(), input_schema.clone()) {
        Ok(res) => res,
        Err(e) => {
            eprintln!("[!] WASM execution error: {}", e);
            return Err(anyhow!("WASM execution failed with error: {}", e));
        }
    };

    // Step 3: Delete the temporary file
    if let Err(e) = std::fs::remove_file(wasm_path) {
        eprintln!("[!] Warning: Failed to delete temporary file {}: {}", wasm_path, e);
    }

    // Step 4: Log and return the result
    println!("[+] WASM Execution Result: {}", serde_json::to_string_pretty(&result)?);
    Ok(result)
}


/// Structure to deserialize incoming API requests
#[derive(Deserialize)]
struct ExecutePythonRequest {
    github_url: String, // GitHub URL to the script
    expected_hash: String, // Expected SHA256 hash of the script
}

/// HTTP POST handler to execute a Python script from a GitHub URL
async fn execute_python_handler(body: web::Json<ExecutePythonRequest>) -> impl Responder {
    let github_url = &body.github_url;
    let expected_hash = &body.expected_hash;

    // TODO: Verify DRT redemption

    // Unseal data pool
    match unseal_data() {
        Ok(json_data) => {
            match execute_python_script(github_url, expected_hash, &json_data) {
                Ok(result) => HttpResponse::Ok().json(result), // Return the script's output
                Err(e) => {
                    eprintln!("[!] Error executing Python script: {}", e);
                    HttpResponse::InternalServerError().body(format!("Execution error: {}", e)) // Return error details
                }
            }
        }, 
        Err(e) => {
            eprintln!("[!] Error unsealing data: {}", e);
            HttpResponse::InternalServerError().body("Failed to unseal data")
        }
    }
    
}

fn execute_python_script(
    github_url: &str,
    expected_hash: &str,
    input_data: &Value,
) -> Result<Value> {

    // Temporary path to save the downloaded Python script
    let script_path = "/tmp/downloaded_script.py";

    // Step 1: Download and verify the script
    verify_and_download_python_github(&github_url, script_path, expected_hash)
        .map_err(|e| anyhow!("Failed to download or verify script: {}", e))?;

    // Step 2: Execute the Python script
    let result = run_python(input_data, script_path)
        .map_err(|e| anyhow!("Python execution error: {}", e))?;

    // Step 3: Delete the temporary file
    if let Err(e) = std::fs::remove_file(script_path) {
        eprintln!("[!] Warning: Failed to delete temporary file {}: {}", script_path, e);
    }

    // Step 4: Format script output
    // Debug print the result, remove in production
    println!("[+] Python Script Result: {}", serde_json::to_string_pretty(&result)?);

    Ok(result)
}

/// Decrypts and unseals the data.
fn unseal_data() -> Result<Value> {
    let sealed_data = std::fs::read("/data/data_pool").map_err(|e| anyhow!("Failed to read sealed data: {}", e))?;
    if sealed_data.len() < 28 {
        return Err(anyhow!("Invalid sealed data: insufficient length for salt, nonce, and ciphertext"));
    }
    let (salt, remaining) = sealed_data.split_at(16);
    let (nonce, ciphertext) = remaining.split_at(12);

    let derived_key = read_and_derive_key(salt)?;
    let cipher = Aes128Gcm::new_from_slice(&derived_key).map_err(|e| anyhow!("Failed to initialize AES-GCM: {}", e))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|e| anyhow!("Decryption failed: {}", e))?;
    serde_json::from_slice(&plaintext).map_err(|e| anyhow!("Failed to parse JSON: {}", e))
}

/// Handler for the `view_data` API
/// Debug function - will be removed in production
async fn view_data_handler() -> impl Responder {
    // Unseal (decrypt) the data
    match unseal_data() {
        Ok(json_data) => HttpResponse::Ok().json(json_data), // Return the JSON data
        Err(e) => {
            eprintln!("[!] Error unsealing data: {}", e);
            HttpResponse::InternalServerError().body("Failed to unseal data")
        }
    }
}
