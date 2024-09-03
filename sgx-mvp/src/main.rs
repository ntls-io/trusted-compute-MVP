extern crate wasmi_impl;

use serde_json::Value;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

static WASM_FILE_MEAN: &str = "bin/get_mean_wasm.wasm";

fn main() {
    println!("[+] Enclave created successfully");

    // Attempt to read the WASM file, and handle the error if it occurs
    let binary_mean = match fs::read(WASM_FILE_MEAN) {
        Ok(data) => {
            println!("[+] Successfully read WASM file");
            data
        }    
        Err(e) => {
            eprintln!("[-] Failed to read WASM file: {}", e);
            return;
        }
    };
 
    // Construct the path to the JSON data and schema files.
    let test_data_file_path = "test-data/1_test_data.json";
    let test_schema_file_path = "test-data/1_test_schema.json";

    // Read the JSON data and schema from their respective files.
    let test_json_data = match read_json_from_file(&test_data_file_path) {
        Ok(data) => {
            println!("[+] Successfully read JSON data file");
            // println!("{}", serde_json::to_string_pretty(&data).unwrap());
            data
        } 
        Err(e) => {
            eprintln!("[-] Error reading JSON data file: {}", e);
            return;
        }
    };
    
    let test_json_schema = match read_json_from_file(&test_schema_file_path) {
        Ok(data) => {
            println!("[+] Successfully read JSON schema file");
            // println!("{}", serde_json::to_string_pretty(&data).unwrap());
            data
        }
        Err(e) => {
            eprintln!("[-] Error reading JSON schema file: {}", e);
            return;
        }
    };

    // Serialize the JSON data and schema.
    let test_serialized_data = serde_json::to_vec(&test_json_data).expect("Failed to serialize data");
    let test_serialized_schema = serde_json::to_vec(&test_json_schema).expect("Failed to serialize schema");

    // Execute the WASM code with the serialized data and schema.

    println!("[+] Successfully ran enclave code");

}

fn read_json_from_file<P: AsRef<Path>>(path: P) -> Result<Value, serde_json::Error> {
    let mut file = File::open(path).expect("Unable to open file");
    let mut contents = String::new();
    file.read_to_string(&mut contents).expect("Unable to read file");
    serde_json::from_str(&contents)
}
