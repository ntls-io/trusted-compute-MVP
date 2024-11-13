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

// File paths to save the downloaded Python scripts
const PYTHON_FILE_MEAN: &str = "/tmp/calculate_mean.py";
const PYTHON_FILE_MEDIAN: &str = "/tmp/calculate_median.py";
const PYTHON_FILE_SD: &str = "/tmp/calculate_sd.py";

// Define a health check route
async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("Server is running")
}

#[tokio::main(flavor = "current_thread")]
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
        .route("/health", web::get().to(health_check)) // Health check route
        .route("/execute_python", web::post().to(execute_python_handler)) // Python execution route
        .route("/execute_wasm", web::post().to(execute_wasm_handler)) // WASM execution route
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

    // TODO: Unseal input data
    let input_data = read_json_from_file("test-data/1_test_data.json").unwrap();

    // TODO: Schema handling
    let input_schema = read_json_from_file("test-data/1_test_schema.json").unwrap();

    match execute_wasm_binary(github_url, expected_hash, &input_data, &input_schema) {
        Ok(result) => HttpResponse::Ok().json(result), // Return the WASM execution result
        Err(e) => {
            eprintln!("[!] Error executing WASM binary: {}", e);
            HttpResponse::InternalServerError().body(format!("Execution error: {}", e)) // Return error details
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


