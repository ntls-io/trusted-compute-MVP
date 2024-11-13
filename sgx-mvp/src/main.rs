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
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use wasmi_impl::{wasm_execution, WasmErrorCode};
use serde::Deserialize;

// WASM binary files
static WASM_FILE_MEAN: &str = "/tmp/get_mean_wasm.wasm";
static WASM_FILE_MEDIAN: &str = "/tmp/get_median_wasm.wasm";
static WASM_FILE_STD_DEV: &str = "/tmp/get_sd_wasm.wasm";

// Expected SHA256 hashes for the WASM binaries
const EXPECTED_WASM_HASH_MEAN: &str = "b5ee81a20256dec2bd3db6e673b11eadae4baf8fafbe68cec1f36517bb569255";
const EXPECTED_WASM_HASH_MEDIAN: &str = "728445d425153350b3e353cc96d29c16d5d81978ea3d7bad21f3d2b2dd76d813";
const EXPECTED_WASM_HASH_SD: &str = "feb835e2eb26115d1865f381ab80440442761f7c89bc7a56d05bca2cb151c37e";

// URLs for WASM binaries on GitHub
const GITHUB_WASM_BASE_URL: &str = "https://raw.githubusercontent.com/ntls-io/WASM-Binaries-MVP/master/bin/";
const WASM_FILE_MEAN_URL: &str = "get_mean_wasm.wasm";
const WASM_FILE_MEDIAN_URL: &str = "get_median_wasm.wasm";
const WASM_FILE_STD_DEV_URL: &str = "get_sd_wasm.wasm";

// File paths to save the downloaded Python scripts
const PYTHON_FILE_MEAN: &str = "/tmp/calculate_mean.py";
const PYTHON_FILE_MEDIAN: &str = "/tmp/calculate_median.py";
const PYTHON_FILE_SD: &str = "/tmp/calculate_sd.py";

// Define a health check route
async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("Server is running")
}

#[tokio::main]
async fn main() -> Result<()> {
    println!("[+] Enclave created successfully");

    // Fetch environment variables with proper error handling
    let database_name = env::var("DATABASE_NAME")
        .map_err(|_| anyhow!("DATABASE_NAME environment variable is not set"))?;
    let collection_name = env::var("COLLECTION_NAME")
        .map_err(|_| anyhow!("COLLECTION_NAME environment variable is not set"))?;
    let cosmosdb_uri = env::var("COSMOSDB_URI")
        .map_err(|_| anyhow!("COSMOSDB_URI environment variable is not set"))?;

    // Remove the environment variables to ensure they are no longer available
    env::remove_var("DATABASE_NAME");
    env::remove_var("COLLECTION_NAME");
    env::remove_var("COSMOSDB_URI");

    println!("[+] Start downloading and verifying WASM binaries");
    // Download and verify WASM binaries
    verify_and_download_wasm(
        GITHUB_WASM_BASE_URL,
        WASM_FILE_MEAN_URL,
        WASM_FILE_MEAN,
        EXPECTED_WASM_HASH_MEAN,
    )?;
    verify_and_download_wasm(
        GITHUB_WASM_BASE_URL,
        WASM_FILE_MEDIAN_URL,
        WASM_FILE_MEDIAN,
        EXPECTED_WASM_HASH_MEDIAN,
    )?;
    verify_and_download_wasm(
        GITHUB_WASM_BASE_URL,
        WASM_FILE_STD_DEV_URL,
        WASM_FILE_STD_DEV,
        EXPECTED_WASM_HASH_SD,
    )?;
    println!("[+] WASM binaries downloaded and verified successfully");

    // Construct the path to the JSON data and schema files
    let json_data_1_path = "test-data/1_test_data.json";
    let json_data_2_path = "test-data/2_test_data.json";

    // Read the JSON data and schema from their respective files
    let json_data_1 = read_json_from_file(&json_data_1_path)?;
    println!("[+] Successfully read JSON data file");

    // Read the JSON schema from MongoDB using the _id field
    let json_schema_1 = read_json_schema_from_mongodb(
        "67064270f0d88c22c4c21169",
        &database_name,
        &collection_name,
        &cosmosdb_uri,
    )
    .await?;
    println!(
        "[+] Successfully read JSON schema from MongoDB: {}",
        serde_json::to_string_pretty(&json_schema_1)?
    );

    // Execute Mean WASM Module
    println!("[+] Execute WASM mean binary with JSON data and schema");
    match wasm_execution(WASM_FILE_MEAN, json_data_1.clone(), json_schema_1.clone()) {
        Ok(result_mean) => {
            println!(
                "[+] Mean Result: {}",
                serde_json::to_string_pretty(&result_mean)?
            );
        }
        Err(error) => {
            handle_wasm_error(error, "Mean");
        }
    }

    // Execute Median WASM Module
    println!("[+] Execute WASM median binary with JSON data and schema");
    match wasm_execution(WASM_FILE_MEDIAN, json_data_1.clone(), json_schema_1.clone()) {
        Ok(result_median) => {
            println!(
                "[+] Median Result: {}",
                serde_json::to_string_pretty(&result_median)?
            );
        }
        Err(error) => {
            handle_wasm_error(error, "Median");
        }
    }

    // Execute Standard Deviation WASM Module
    println!("[+] Execute WASM standard deviation binary with JSON data and schema");
    match wasm_execution(
        WASM_FILE_STD_DEV,
        json_data_1.clone(),
        json_schema_1.clone(),
    ) {
        Ok(result_std_dev) => {
            println!(
                "[+] Standard Deviation Result: {}",
                serde_json::to_string_pretty(&result_std_dev)?
            );
        }
        Err(error) => {
            handle_wasm_error(error, "Standard Deviation");
        }
    }

    println!("[+] Append JSON files");
    let json_data_2 = read_json_from_file(&json_data_2_path)?;

    // Read the JSON schema from MongoDB using the _id field
    let json_schema_2 = read_json_schema_from_mongodb(
        "67064270f0d88c22c4c21169",
        &database_name,
        &collection_name,
        &cosmosdb_uri,
    )
    .await?;

    // Validate the schemas before appending
    if validate_json_schemas(&json_schema_1, &json_schema_2) {
        let appended_json = append_json(&json_data_1, &json_data_2)?;
        // Save the appended JSON data to /tmp/merged_json.json
        let output_file_path = "/tmp/merged_json.json";
        write_json_to_file(&appended_json, output_file_path)?;
        println!("[+] Appended JSON data saved to '{}'", output_file_path);
    } else {
        eprintln!("[!] JSON schemas do not match. Cannot append the data.");
        return Err(anyhow!("JSON schema validation failed"));
    }

    println!("[+] Successfully ran enclave code");

    // Start the Actix Web server
    HttpServer::new(|| {
        App::new()
        .route("/health", web::get().to(health_check))
        .route("/execute_python", web::post().to(execute_python_handler))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
    .map_err(|e| anyhow!("Actix web server error: {}", e))
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

/// Helper function to handle WASM errors
fn handle_wasm_error(error: Error, operation: &str) {
    // Attempt to downcast the error to WasmErrorCode
    if let Some(wasm_error) = error.downcast_ref::<WasmErrorCode>() {
        eprintln!(
            "[!] Error during '{}' operation: {} (Error code: {})",
            operation,
            wasm_error,
            wasm_error.code()
        );
    } else {
        // Handle other errors
        eprintln!("[!] Error during '{}' operation: {}", operation, error);
    }
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

    // TODO: Unseal input data
    let input_data = read_json_from_file("test-data/1_test_data.json").unwrap();

    match execute_python_script(github_url, expected_hash, &input_data) {
        Ok(result) => HttpResponse::Ok().json(result), // Return the script's output
        Err(e) => {
            eprintln!("[!] Error executing Python script: {}", e);
            HttpResponse::InternalServerError().body(format!("Execution error: {}", e)) // Return error details
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


