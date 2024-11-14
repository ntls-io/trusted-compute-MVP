extern crate github_download;
extern crate json_append;
extern crate python_rust_impl;
extern crate sgx_cosmos_db;
extern crate wasmi_impl;

use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use anyhow::{anyhow, Error, Result};
use github_download::{verify_and_download_python_github, verify_and_download_wasm};
use json_append::{append_json, validate_json_schemas};
use python_rust_impl::run_python;
use serde_json::Value;
use sgx_cosmos_db::read_json_schema_from_mongodb;
use std::env;
use std::fs::{read, File};
use std::io::{Read, Write};
use std::path::Path;
use wasmi_impl::{wasm_execution, WasmErrorCode};
use serde::Deserialize;
use aes_gcm::{Aes128Gcm, KeyInit, Nonce}; // AES-GCM for encryption
use aes_gcm::aead::Aead;
use rand;

// Define a health check route
async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("Server is running")
}

/// Read the attestation key from the specified path
fn read_attestation_key(key_path: &str) -> Result<[u8; 16]> {
    let key_data = read(key_path).map_err(|e| anyhow!("Failed to read key: {}", e))?;
    if key_data.len() != 16 {
        return Err(anyhow!("Invalid key length: expected 16 bytes, got {}", key_data.len()));
    }
    let mut key = [0u8; 16];
    key.copy_from_slice(&key_data);
    Ok(key)
}

/// Encrypt the JSON data using AES-GCM with a 128-bit key
fn seal_data(data: &Value, key: &[u8; 16]) -> Result<Vec<u8>> {
    let cipher = Aes128Gcm::new_from_slice(key).map_err(|e| anyhow!("Failed to initialize AES-GCM: {}", e))?;
    let nonce = rand::random::<[u8; 12]>(); // Generate a random 12-byte nonce
    let serialized_data = serde_json::to_vec(data).map_err(|e| anyhow!("Failed to serialize JSON: {}", e))?;
    let ciphertext = cipher
        .encrypt(&Nonce::from_slice(&nonce), serialized_data.as_ref())
        .map_err(|e| anyhow!("Encryption failed: {}", e))?;
    // Combine nonce and ciphertext for storage
    let mut sealed_data = Vec::with_capacity(nonce.len() + ciphertext.len());
    sealed_data.extend_from_slice(&nonce);
    sealed_data.extend_from_slice(&ciphertext);
    Ok(sealed_data)
}

/// Save sealed data to the specified path
fn save_to_file(data: &[u8], file_path: &str) -> Result<()> {
    let mut file = File::create(file_path).map_err(|e| anyhow!("Failed to create file: {}", e))?;
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
    
    let key_path = "/dev/attestation/keys/_sgx_mrenclave"; // Enclave-specific key
    let sealed_data_path = "/data/data_pool"; // Path to sealed data

    // Read the attestation key
    let sealing_key = match read_attestation_key(key_path) {
        Ok(key) => key,
        Err(e) => {
            eprintln!("[!] Error reading key: {}", e);
            return HttpResponse::InternalServerError().body("Failed to read attestation key");
        }
    };

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
    let sealed_data = match seal_data(&updated_data, &sealing_key) {
        Ok(data) => data,
        Err(e) => {
            eprintln!("[!] Error sealing data: {}", e);
            return HttpResponse::InternalServerError().body("Failed to seal data");
        }
    };

    // Save the sealed data back to the file
    if let Err(e) = save_to_file(&sealed_data, sealed_data_path) {
        eprintln!("[!] Error saving sealed data: {}", e);
        return HttpResponse::InternalServerError().body("Failed to save sealed data");
    }

    HttpResponse::Ok().body("Data merged, sealed, and saved successfully")
}

/// Request structure for the `create_data_pool` API
#[derive(Deserialize)]
struct CreateDataPoolRequest {
    data: Value, // JSON data to be sealed
}

/// Handler for the `create_data_pool` API
async fn create_data_pool_handler(body: web::Json<CreateDataPoolRequest>) -> impl Responder {
    let key_path = "/dev/attestation/keys/_sgx_mrenclave"; // Enclave-specific key
    let save_path = "/data/data_pool"; // Path to save sealed data

    // TODO: DRT Verification, only the first user can call execute function

    // Read the attestation key
    let sealing_key = match read_attestation_key(key_path) {
        Ok(key) => key,
        Err(e) => {
            eprintln!("[!] Error reading key: {}", e);
            return HttpResponse::InternalServerError().body("Failed to read attestation key");
        }
    };

    // Seal the data
    let sealed_data = match seal_data(&body.data, &sealing_key) {
        Ok(data) => data,
        Err(e) => {
            eprintln!("[!] Error sealing data: {}", e);
            return HttpResponse::InternalServerError().body("Failed to seal data");
        }
    };

    // TODO: Save the sealed data to IPFS or other cloud storage
    // Save the sealed data to the specified path
    if let Err(e) = save_to_file(&sealed_data, save_path) {
        eprintln!("[!] Error saving sealed data: {}", e);
        return HttpResponse::InternalServerError().body("Failed to save sealed data");
    }

    HttpResponse::Ok().body("Data sealed and saved successfully")
}

/// Helper function to read JSON from a file
fn read_json_from_file<P: AsRef<Path>>(path: P) -> Result<Value> {
    let mut file = File::open(&path).map_err(|e| anyhow!("Failed to open file: {}", e))?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| anyhow!("Failed to read file: {}", e))?;
    let json: Value =
        serde_json::from_str(&contents).map_err(|e| anyhow!("Failed to parse JSON: {}", e))?;
    Ok(json)
}

/// Helper function to write JSON to a file
fn write_json_to_file(json_data: &Value, file_path: &str) -> Result<()> {
    let mut file = File::create(file_path).map_err(|e| anyhow!("Failed to create file: {}", e))?;
    let json_string = serde_json::to_string_pretty(json_data)
        .map_err(|e| anyhow!("Failed to serialize JSON: {}", e))?;
    file.write_all(json_string.as_bytes())
        .map_err(|e| anyhow!("Failed to write to file: {}", e))?;
    Ok(())
}

/// Structure to deserialize incoming API requests
#[derive(Deserialize)]
struct ExecuteWasmRequest {
    github_url: String,      // GitHub URL to the WASM binary
    expected_hash: String,   // Expected SHA256 hash of the WASM binary
}

async fn execute_wasm_handler(body: web::Json<ExecuteWasmRequest>) -> impl Responder {
    let github_url = &body.github_url;
    let expected_hash = &body.expected_hash;
    
    // TODO: Verify DRT redemption

    // Unseal data pool
    match unseal_data() {
        Ok(json_data) => {
            // TODO: Schema handling
            let input_schema = read_json_from_file("test-data/1_test_schema.json").unwrap();

            match execute_wasm_binary(github_url, expected_hash, &json_data, &input_schema) {
                Ok(result) => HttpResponse::Ok().json(result), // Return the WASM execution result
                Err(e) => {
                    eprintln!("[!] Error executing WASM binary: {}", e);
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

    // Step 2: Execute the WASM binary
    let result = wasm_execution(wasm_path, input_data.clone(), input_schema.clone())
        .map_err(|e| anyhow!("WASM execution error: {}", e))?;

    // Step 3: Log and return the result
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

    // Step 3: Format script output
    println!("[+] Python Script Result: {}", serde_json::to_string_pretty(&result)?);

    Ok(result)
}

/// Decrypt sealed data using AES-GCM with a 128-bit key
fn unseal_data() -> Result<Value> {
    let key_path = "/dev/attestation/keys/_sgx_mrenclave"; // Path to the key

    // TODO: Download the sealed data from IPFS or other cloud storage
    let sealed_data_path = "/data/data_pool"; // Path to the sealed data file

    // Read the attestation key
    let sealing_key = read_attestation_key(key_path).map_err(|e| {
        eprintln!("[!] Error reading key: {}", e);
        anyhow!("Failed to read attestation key")
    })?;

    // Read the sealed data from file
    let sealed_data = std::fs::read(sealed_data_path).map_err(|e| {
        eprintln!("[!] Error reading sealed data: {}", e);
        anyhow!("Failed to read sealed data")
    })?;

    // Ensure sealed data contains a nonce and ciphertext
    if sealed_data.len() < 12 {
        return Err(anyhow!("Invalid sealed data: insufficient length for nonce and ciphertext"));
    }

    // Extract nonce (first 12 bytes) and ciphertext
    let nonce = &sealed_data[..12];
    let ciphertext = &sealed_data[12..];

    // Initialize AES-GCM cipher
    let cipher = Aes128Gcm::new_from_slice(&sealing_key).map_err(|e| {
        eprintln!("[!] Error initializing AES-GCM: {}", e);
        anyhow!("Failed to initialize AES-GCM")
    })?;

    // Decrypt the ciphertext
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|e| {
            eprintln!("[!] Error decrypting data: {}", e);
            anyhow!("Decryption failed")
        })?;

    // Deserialize the plaintext back into JSON
    serde_json::from_slice(&plaintext).map_err(|e| {
        eprintln!("[!] Error parsing JSON: {}", e);
        anyhow!("Failed to parse JSON")
    })
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
