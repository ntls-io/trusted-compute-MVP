extern crate wasm_test;

use serde_json::Value;
use std::fs::File;
use std::io::Read;
use std::path::Path;

static WASM_FILE_MEAN: &str = "bin/get_mean_wasm.wasm";

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

    println!("[+] Execute WASM binary with JSON data and schema");
    // Call the function with the parameters and handle the result
    let result_json = wasm_test::wasm_execution(WASM_FILE_MEAN, test_json_data, test_json_schema)?;
    println!("[+] Result: {}", serde_json::to_string_pretty(&result_json)?);

    println!("[+] Successfully ran enclave code");
    Ok(())
}

fn read_json_from_file<P: AsRef<Path>>(path: P) -> Result<Value, serde_json::Error> {
    let mut file = File::open(path).expect("Unable to open file");
    let mut contents = String::new();
    file.read_to_string(&mut contents).expect("Unable to read file");
    serde_json::from_str(&contents)
}
