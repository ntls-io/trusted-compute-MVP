// src/main.rs

extern crate wasmi_impl;

use serde_json::Value;
use std::fs::File;
use std::path::Path;
use std::io::Read;
use anyhow;
use wasmi_impl::WasmErrorCode;
use pyo3::prelude::*;
use pyo3::types::PyDict;

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

    // Execute Python Mean Calculation via FFI
    let python_mean_result = run_python_mean_calculation(&test_json_data)?;
    println!("[+] Python Mean Result: {}", serde_json::to_string_pretty(&python_mean_result)?);

    // Execute Python Median Calculation via FFI
    let python_median_result = run_python_median_calculation(&test_json_data)?;
    println!("[+] Python Median Result: {}", serde_json::to_string_pretty(&python_median_result)?);

    // Execute Python SD Calculation via FFI
    let python_sd_result = run_python_sd_calculation(&test_json_data)?;
    println!("[+] Python standard deviation Result: {}", serde_json::to_string_pretty(&python_sd_result)?);

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

fn run_python_mean_calculation(test_json_data: &Value) -> Result<Value, Box<dyn std::error::Error>> {
    Python::with_gil(|py| {
        // Load the external Python script
        let py_file_path = "python-scripts/calculate_mean.py"; // Path to the Python script
        
        // Open and read the Python file contents
        let code = std::fs::read_to_string(py_file_path)
            .map_err(|e| anyhow::anyhow!("Failed to read Python script: {}", e))?;
        
        // Create a Python dictionary to hold the data
        let locals = PyDict::new(py);

        // Convert the JSON data to a string and set it in the Python locals
        locals.set_item("data", serde_json::to_string(test_json_data)?)?;

        // Run the Python code from the file in the current Python context
        py.run(&code, None, None)?;

        // Execute the mean calculation in the current context
        let result: String = py
            .eval("calculate_mean(json.loads(data))", None, Some(locals))?
            .extract()?;

        // Parse the result back into a Rust serde_json::Value
        let python_result: Value = serde_json::from_str(&result)?;

        Ok(python_result)
    })
}

fn run_python_median_calculation(test_json_data: &Value) -> Result<Value, Box<dyn std::error::Error>> {
    Python::with_gil(|py| {
        // Load the external Python script
        let py_file_path = "python-scripts/calculate_median.py"; // Path to the Python script
        
        // Open and read the Python file contents
        let code = std::fs::read_to_string(py_file_path)
            .map_err(|e| anyhow::anyhow!("Failed to read Python script: {}", e))?;
        
        // Create a Python dictionary to hold the data
        let locals = PyDict::new(py);

        // Convert the JSON data to a string and set it in the Python locals
        locals.set_item("data", serde_json::to_string(test_json_data)?)?;

        // Run the Python code from the file in the current Python context
        py.run(&code, None, None)?;

        // Execute the mean calculation in the current context
        let result: String = py
            .eval("calculate_median(json.loads(data))", None, Some(locals))?
            .extract()?;

        // Parse the result back into a Rust serde_json::Value
        let python_result: Value = serde_json::from_str(&result)?;

        Ok(python_result)
    })
}

fn run_python_sd_calculation(test_json_data: &Value) -> Result<Value, Box<dyn std::error::Error>> {
    Python::with_gil(|py| {
        // Load the external Python script
        let py_file_path = "python-scripts/calculate_sd.py"; // Path to the Python script
        
        // Open and read the Python file contents
        let code = std::fs::read_to_string(py_file_path)
            .map_err(|e| anyhow::anyhow!("Failed to read Python script: {}", e))?;
        
        // Create a Python dictionary to hold the data
        let locals = PyDict::new(py);

        // Convert the JSON data to a string and set it in the Python locals
        locals.set_item("data", serde_json::to_string(test_json_data)?)?;

        // Run the Python code from the file in the current Python context
        py.run(&code, None, None)?;

        // Execute the mean calculation in the current context
        let result: String = py
            .eval("calculate_standard_deviation(json.loads(data))", None, Some(locals))?
            .extract()?;

        // Parse the result back into a Rust serde_json::Value
        let python_result: Value = serde_json::from_str(&result)?;

        Ok(python_result)
    })
}