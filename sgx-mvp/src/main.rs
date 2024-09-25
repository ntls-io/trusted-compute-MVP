// src/main.rs

extern crate wasmi_impl;
extern crate python_rust_impl;
extern crate json_append;

use serde_json::Value;
use std::fs::File;
use std::path::Path;
use std::io::{Read, Write};
use anyhow;
use wasmi_impl::WasmErrorCode;

// WASM binary files
static WASM_FILE_MEAN: &str = "bin/get_mean_wasm.wasm";
static WASM_FILE_MEDIAN: &str = "bin/get_median_wasm.wasm";
static WASM_FILE_STD_DEV: &str = "bin/get_sd_wasm.wasm";

// Python script files
static PYTHON_FILE_MEAN: &str = "python-scripts/calculate_mean.py";
static PYTHON_FILE_MEDIAN: &str = "python-scripts/calculate_median.py";
static PYTHON_FILE_SD: &str = "python-scripts/calculate_sd.py";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("[+] Enclave created successfully");

    // Construct the path to the JSON data and schema files.
    let json_data_1_path = "test-data/1_test_data.json";
    let json_data_2_path = "test-data/2_test_data.json";
    let json_schema_1_path = "test-data/1_test_schema.json";
    let json_schema_2_path = "test-data/2_test_schema.json";

    // Read the JSON data and schema from their respective files.
    let json_data_1 = read_json_from_file(&json_data_1_path)?;
    println!("[+] Successfully read JSON data file");

    let json_schema_1 = read_json_from_file(&json_schema_1_path)?;
    println!("[+] Successfully read JSON schema file");

    // Execute Mean WASM Module
    println!("[+] Execute WASM mean binary with JSON data and schema");
    match wasmi_impl::wasm_execution(WASM_FILE_MEAN, json_data_1.clone(), json_schema_1.clone()) {
        Ok(result_mean) => {
            println!("[+] Mean Result: {}", serde_json::to_string_pretty(&result_mean)?);
        }
        Err(code) => {
            handle_wasm_error(code, "Mean");
            // Optionally, handle the error (e.g., exit, continue, retry)
        }
    }

    // Execute Median WASM Module
    println!("[+] Execute WASM median binary with JSON data and schema");
    match wasmi_impl::wasm_execution(WASM_FILE_MEDIAN, json_data_1.clone(), json_schema_1.clone()) {
        Ok(result_median) => {
            println!("[+] Median Result: {}", serde_json::to_string_pretty(&result_median)?);
        }
        Err(code) => {
            handle_wasm_error(code, "Median");
            // Optionally, handle the error
        }
    }

    // Execute Standard Deviation WASM Module
    println!("[+] Execute WASM standard deviation binary with JSON data and schema");
    match wasmi_impl::wasm_execution(WASM_FILE_STD_DEV, json_data_1.clone(), json_schema_1.clone()) {
        Ok(result_std_dev) => {
            println!("[+] Standard Deviation Result: {}", serde_json::to_string_pretty(&result_std_dev)?);
        }
        Err(code) => {
            handle_wasm_error(code, "Standard Deviation");
            // Optionally, handle the error
        }
    }

    // Execute Python Mean Calculation via FFI
    let python_mean_result = python_rust_impl::run_python(&json_data_1, PYTHON_FILE_MEAN)?;
    println!("[+] Python Mean Result: {}", serde_json::to_string_pretty(&python_mean_result)?);

    // Execute Python Median Calculation via FFI
    let python_median_result = python_rust_impl::run_python(&json_data_1, PYTHON_FILE_MEDIAN)?;
    println!("[+] Python Median Result: {}", serde_json::to_string_pretty(&python_median_result)?);

    // Execute Python SD Calculation via FFI
    let python_sd_result = python_rust_impl::run_python(&json_data_1, PYTHON_FILE_SD)?;
    println!("[+] Python Standard Deviation Result: {}", serde_json::to_string_pretty(&python_sd_result)?);

    println!("[+] Append JSON files");
    let json_data_2 = read_json_from_file(&json_data_2_path)?;
    let json_schema_2 = read_json_from_file(&json_schema_2_path)?;

    // Validate the schemas before appending
    if json_append::validate_json_schemas(&json_schema_1, &json_schema_2) {
        let appended_json = json_append::append_json(&json_data_1, &json_data_2)?;

        // Save the appended JSON data to /temp/merged_json.json
        let output_file_path = "/temp/merged_json.json";
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
fn read_json_from_file<P: AsRef<Path>>(path: P) -> Result<Value, Box<dyn std::error::Error>> {
    let mut file = File::open(&path)
        .map_err(|e| anyhow::anyhow!("Unable to open file '{}': {}", path.as_ref().display(), e))?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| anyhow::anyhow!("Unable to read file '{}': {}", path.as_ref().display(), e))?;
    let json: Value = serde_json::from_str(&contents)
        .map_err(|e| anyhow::anyhow!("Failed to parse JSON from file '{}': {}", path.as_ref().display(), e))?;
    Ok(json)
}

/// Helper function to write JSON to a file
fn write_json_to_file(json_data: &Value, file_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut file = File::create(file_path)
        .map_err(|e| anyhow::anyhow!("Unable to create file '{}': {}", file_path, e))?;
    let json_string = serde_json::to_string_pretty(json_data)
        .map_err(|e| anyhow::anyhow!("Failed to convert JSON data to string: {}", e))?;
    file.write_all(json_string.as_bytes())
        .map_err(|e| anyhow::anyhow!("Failed to write JSON data to file '{}': {}", file_path, e))?;
    Ok(())
}

/// Helper function to handle WASM error codes
fn handle_wasm_error(code: i32, operation: &str) {
    let wasm_error: WasmErrorCode = code.into();
    eprintln!("[!] Error during '{}' operation: {}", operation, wasm_error);
}