extern crate wasmi_impl;
extern crate python_rust_impl;
extern crate json_append;
extern crate github_download;
extern crate sgx_cosmos_db;

use serde_json::Value;
use std::fs::File;
use std::path::Path;
use std::io::{Read, Write};
use std::env;
use anyhow;
use wasmi_impl::{WasmErrorCode, wasm_execution};
use python_rust_impl::run_python;
use json_append::{append_json, validate_json_schemas};
use std::error::Error;
use github_download::{verify_and_download_python, verify_and_download_wasm};
use sgx_cosmos_db::read_json_schema_from_mongodb;

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

// URLs for Python scripts on GitHub
const GITHUB_BASE_URL: &str = "https://raw.githubusercontent.com/ntls-io/Python-Scripts-MVP/main/";
const PYTHON_FILE_MEAN_URL: &str = "calculate_mean.py";
const PYTHON_FILE_MEDIAN_URL: &str = "calculate_median.py";
const PYTHON_FILE_SD_URL: &str = "calculate_sd.py";

// File paths to save the downloaded Python scripts
const PYTHON_FILE_MEAN: &str = "/tmp/calculate_mean.py";
const PYTHON_FILE_MEDIAN: &str = "/tmp/calculate_median.py";
const PYTHON_FILE_SD: &str = "/tmp/calculate_sd.py";

// Expected SHA256 hashes for the Python scripts
const EXPECTED_HASH_MEAN: &str = "d1bb84ecf1f107013df0fe5ea8a63c15bbd673a81a13a6871c6b43d7e85fd690";
const EXPECTED_HASH_MEDIAN: &str = "bcda34f2af83a2dac745a5d86f18f4c4cd6cb4e61c76e0dec005a5fc9bc124f5";
const EXPECTED_HASH_SD: &str = "65230a7a140e30f94fe4d070c9f9e8146a44c2f59d85bff2e83ac9ffa5db39ee";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("[+] Enclave created successfully");

    // Fetch environment variables
    let database_name = env::var("DATABASE_NAME")
        .expect("DATABASE_NAME environment variable is not set");
    let collection_name = env::var("COLLECTION_NAME")
        .expect("COLLECTION_NAME environment variable is not set");
    let cosmosdb_uri = env::var("COSMOSDB_URI")
        .expect("COSMOSDB_URI environment variable is not set");

    // Remove the environment variables to ensure they are no longer available
    // Prevent misuse by external code
    env::remove_var("DATABASE_NAME");
    env::remove_var("COLLECTION_NAME");
    env::remove_var("COSMOSDB_URI");

    println!("[+] Start downloading and verifying Python scripts");
    // Download Python scripts from GitHub and verify their hashes
    verify_and_download_python(GITHUB_BASE_URL, PYTHON_FILE_MEAN_URL, PYTHON_FILE_MEAN, EXPECTED_HASH_MEAN)?;
    verify_and_download_python(GITHUB_BASE_URL, PYTHON_FILE_MEDIAN_URL, PYTHON_FILE_MEDIAN, EXPECTED_HASH_MEDIAN)?;
    verify_and_download_python(GITHUB_BASE_URL, PYTHON_FILE_SD_URL, PYTHON_FILE_SD, EXPECTED_HASH_SD)?;
    println!("[+] Python scripts downloaded and verified successfully");

    println!("[+] Start downloading and verifying WASM binaries");
    // Download and verify WASM binaries
    verify_and_download_wasm(GITHUB_WASM_BASE_URL, WASM_FILE_MEAN_URL, WASM_FILE_MEAN, EXPECTED_WASM_HASH_MEAN)?;
    verify_and_download_wasm(GITHUB_WASM_BASE_URL, WASM_FILE_MEDIAN_URL, WASM_FILE_MEDIAN, EXPECTED_WASM_HASH_MEDIAN)?;
    verify_and_download_wasm(GITHUB_WASM_BASE_URL, WASM_FILE_STD_DEV_URL, WASM_FILE_STD_DEV, EXPECTED_WASM_HASH_SD)?;
    println!("[+] WASM binaries downloaded and verified successfully");

    // Construct the path to the JSON data and schema files
    let json_data_1_path = "test-data/1_test_data.json";
    let json_data_2_path = "test-data/2_test_data.json";

    // Read the JSON data and schema from their respective files
    let json_data_1 = read_json_from_file(&json_data_1_path)?;
    println!("[+] Successfully read JSON data file");

    // Read the JSON schema from MongoDB using the _id field
    let json_schema_1 = read_json_schema_from_mongodb("67064270f0d88c22c4c21169", &database_name, &collection_name, &cosmosdb_uri).await?;
    println!("[+] Successfully read JSON schema from MongoDB: {}", serde_json::to_string_pretty(&json_schema_1)?);

    // Execute Mean WASM Module
    println!("[+] Execute WASM mean binary with JSON data and schema");
    match wasm_execution(WASM_FILE_MEAN, json_data_1.clone(), json_schema_1.clone()) {
        Ok(result_mean) => {
            println!("[+] Mean Result: {}", serde_json::to_string_pretty(&result_mean)?);
        }
        Err(code) => {
            handle_wasm_error(code, "Mean");
        }
    }

    // Execute Median WASM Module
    println!("[+] Execute WASM median binary with JSON data and schema");
    match wasm_execution(WASM_FILE_MEDIAN, json_data_1.clone(), json_schema_1.clone()) {
        Ok(result_median) => {
            println!("[+] Median Result: {}", serde_json::to_string_pretty(&result_median)?);
        }
        Err(code) => {
            handle_wasm_error(code, "Median");
        }
    }

    // Execute Standard Deviation WASM Module
    println!("[+] Execute WASM standard deviation binary with JSON data and schema");
    match wasm_execution(WASM_FILE_STD_DEV, json_data_1.clone(), json_schema_1.clone()) {
        Ok(result_std_dev) => {
            println!("[+] Standard Deviation Result: {}", serde_json::to_string_pretty(&result_std_dev)?);
        }
        Err(code) => {
            handle_wasm_error(code, "Standard Deviation");
        }
    }

    // Execute Python Mean Calculation via FFI
    let python_mean_result = run_python(&json_data_1, PYTHON_FILE_MEAN)?;
    println!("[+] Python Mean Result: {}", serde_json::to_string_pretty(&python_mean_result)?);

    // Execute Python Median Calculation via FFI
    let python_median_result = run_python(&json_data_1, PYTHON_FILE_MEDIAN)?;
    println!("[+] Python Median Result: {}", serde_json::to_string_pretty(&python_median_result)?);

    // Execute Python SD Calculation via FFI
    let python_sd_result = run_python(&json_data_1, PYTHON_FILE_SD)?;
    println!("[+] Python Standard Deviation Result: {}", serde_json::to_string_pretty(&python_sd_result)?);

    println!("[+] Append JSON files");
    let json_data_2 = read_json_from_file(&json_data_2_path)?;

    // Read the JSON schema from MongoDB using the _id field
    let json_schema_2 = read_json_schema_from_mongodb("67064270f0d88c22c4c21169", &database_name, &collection_name, &cosmosdb_uri).await?;

    // Validate the schemas before appending
    if validate_json_schemas(&json_schema_1, &json_schema_2) {
        let appended_json = append_json(&json_data_1, &json_data_2)?;

        // Save the appended JSON data to /tmp/merged_json.json
        let output_file_path = "/tmp/merged_json.json";
        write_json_to_file(&appended_json, output_file_path)?;
        println!("[+] Appended JSON data saved to '{}'", output_file_path);
    } else {
        eprintln!("[!] JSON schemas do not match. Cannot append the data.");
        return Err(anyhow::anyhow!("JSON schema validation failed").into());
    }

    println!("[+] Successfully ran enclave code");
    Ok(())
}

/// Helper function to read JSON from a file
fn read_json_from_file<P: AsRef<Path>>(path: P) -> Result<Value, Box<dyn Error>> {
    let mut file = File::open(&path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    let json: Value = serde_json::from_str(&contents)?;
    Ok(json)
}

/// Helper function to write JSON to a file
fn write_json_to_file(json_data: &Value, file_path: &str) -> Result<(), Box<dyn Error>> {
    let mut file = File::create(file_path)?;
    let json_string = serde_json::to_string_pretty(json_data)?;
    file.write_all(json_string.as_bytes())?;
    Ok(())
}

/// Helper function to handle WASM error codes
fn handle_wasm_error(code: i32, operation: &str) {
    let wasm_error: WasmErrorCode = code.into();
    eprintln!("[!] Error during '{}' operation: {}", operation, wasm_error);
}