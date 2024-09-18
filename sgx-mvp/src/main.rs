extern crate wasm_test;

use serde_json::Value;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use serde_json::json;

static WASM_FILE_MEAN: &str = "bin/get_mean_wasm.wasm";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("[+] Enclave created successfully");

    // Attempt to read the WASM file, and handle the error if it occurs
    let binary_mean = fs::read(WASM_FILE_MEAN).map_err(|e| {
        eprintln!("[-] Failed to read WASM file: {}", e);
        e
    })?;

    println!("[+] Successfully read WASM file");

    // Construct the path to the JSON data and schema files.
    let test_data_file_path = "test-data/1_test_data.json";
    let test_schema_file_path = "test-data/1_test_schema.json";

    // Read the JSON data and schema from their respective files.
    let test_json_data = read_json_from_file(&test_data_file_path)?;
    println!("[+] Successfully read JSON data file");

    let test_json_schema = read_json_from_file(&test_schema_file_path)?;
    println!("[+] Successfully read JSON schema file");

    // Execute the WASM code with the serialized data and schema.
    let binary = "bin/get_mean_wasm.wasm";

    let data = json!({
        "Column_1": [
            5.23, 12.47, 8.91, 3.58, 19.34,
            6.75, 14.62, 2.89, 11.04, 7.56,
            4.33, 16.78, 9.10, 1.95, 13.67,
            10.50, 18.22, 20.00, 15.85, 17.49
        ],
        "Column_2": [
            25.13, 22.87, 29.45, 24.68, 26.54,
            27.39, 23.76, 28.12, 21.95, 30.48,
            31.67, 32.89, 33.55, 34.20, 35.78,
            36.45, 37.90, 38.33, 39.12, 40.07
        ],
        "Column_3": [
            41.56, 42.89, 43.14, 44.67, 45.23,
            46.78, 47.35, 48.90, 49.12, 50.44,
            51.67, 52.89, 53.21, 54.56, 55.78,
            56.34, 57.89, 58.12, 59.45, 60.00
        ],
        "Column_4": [
            61.78, 62.34, 63.89, 64.12, 65.56,
            66.90, 67.45, 68.78, 69.23, 70.67,
            71.89, 72.34, 73.56, 74.90, 75.12,
            76.45, 77.89, 78.34, 79.67, 80.00
        ]
    });

    let schema = json!({
        "properties": {
            "Column_1": {
                "type": "array",
                "items": { "type": "number" }
            },
            "Column_2": {
                "type": "array",
                "items": { "type": "number" }
            },
            "Column_3": {
                "type": "array",
                "items": { "type": "number" }
            },
            "Column_4": {
                "type": "array",
                "items": { "type": "number" }
            }
        }
    });

    // Call the function with the parameters and handle the result
    let result_json = wasm_test::wasm_execution(binary, data, schema)?;
    println!("Result: {}", serde_json::to_string_pretty(&result_json)?);

    println!("[+] Successfully ran enclave code");
    Ok(())
}

fn read_json_from_file<P: AsRef<Path>>(path: P) -> Result<Value, serde_json::Error> {
    let mut file = File::open(path).expect("Unable to open file");
    let mut contents = String::new();
    file.read_to_string(&mut contents).expect("Unable to read file");
    serde_json::from_str(&contents)
}
