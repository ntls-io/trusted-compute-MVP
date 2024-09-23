// src/main.rs

extern crate wasmi_impl;

use serde_json::Value;
use std::fs::File;
use std::path::Path;
use std::io::{Read, Write};
use std::process::Command;
use std::process::Stdio;
use anyhow;
use wasmi_impl::WasmErrorCode;

static WASM_FILE_MEAN: &str = "bin/get_mean_wasm.wasm";
static WASM_FILE_MEDIAN: &str = "bin/get_median_wasm.wasm";
static WASM_FILE_STD_DEV: &str = "bin/get_sd_wasm.wasm";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("[+] Enclave created successfully");

    // Construct the path to the JSON data and schema files.
    let test_data_file_path = "test-data/1_test_data.json";
    let test_schema_file_path = "test-data/1_test_schema.json";

    // Read the JSON data and schema from their respective files.
    let test_json_data = read_json_from_file(&test_data_file_path)?;
    println!("[+] Successfully read JSON data file");

    let test_json_schema = read_json_from_file(&test_schema_file_path)?;
    println!("[+] Successfully read JSON schema file");

    // Execute Mean WASM Module
    println!("[+] Execute WASM mean binary with JSON data and schema");
    match wasmi_impl::wasm_execution(WASM_FILE_MEAN, test_json_data.clone(), test_json_schema.clone()) {
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
    match wasmi_impl::wasm_execution(WASM_FILE_MEDIAN, test_json_data.clone(), test_json_schema.clone()) {
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
    match wasmi_impl::wasm_execution(WASM_FILE_STD_DEV, test_json_data.clone(), test_json_schema.clone()) {
        Ok(result_std_dev) => {
            println!("[+] Standard Deviation Result: {}", serde_json::to_string_pretty(&result_std_dev)?);
        }
        Err(code) => {
            handle_wasm_error(code, "Standard Deviation");
            // Optionally, handle the error
        }
    }

    // Pass the JSON data to the Python script and capture the result
    let python_mean_result = run_python_mean_calculation(test_json_data.clone())?;
    println!("[+] Python Mean Result: {}", serde_json::to_string_pretty(&python_mean_result)?);
    

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

/// Helper function to handle WASM error codes
fn handle_wasm_error(code: i32, operation: &str) {
    let wasm_error: WasmErrorCode = code.into();
    eprintln!("[!] Error during '{}' operation: {}", operation, wasm_error);
}

/// Function to run Python mean calculation with JSON data passed from Rust and return the result to Rust
fn run_python_mean_calculation(test_json_data: Value) -> Result<Value, Box<dyn std::error::Error>> {
    println!("[+] Running Python script to calculate mean of each field...");

    // Serialize the JSON data
    let json_input = serde_json::to_string(&test_json_data)?;

    // Spawn the Python process and pass the JSON data via stdin
    let mut process = Command::new("/usr/bin/python3.8")
        .arg("calculate_means.py")  // Python script
        .stdin(Stdio::piped())      // Allow passing stdin
        .stdout(Stdio::piped())     // Capture stdout
        .spawn()
        .expect("Failed to execute Python script");

    // Write the JSON data to the stdin of the Python process
    if let Some(mut stdin) = process.stdin.take() {
        stdin.write_all(json_input.as_bytes())?;  // Correct method to write to stdin
    }

    // Capture the output of the Python script
    let output = process.wait_with_output()?;

    if output.status.success() {
        let stdout = String::from_utf8(output.stdout)?;
        // Parse the Python script's stdout (which is JSON) into a Rust serde_json::Value
        let python_result: Value = serde_json::from_str(&stdout)?;
        Ok(python_result)
    } else {
        let stderr = String::from_utf8(output.stderr)?;
        eprintln!("Python error: {}", stderr);
        Err(anyhow::anyhow!("Python script execution failed").into())
    }
}
