use serde_json::{Value, json, from_slice, to_vec};
use std::slice;

#[no_mangle]
pub extern "C" fn exec(
    input_data_ptr: i32,
    input_data_len: i32,
    input_schema_ptr: i32,
    input_schema_len: i32,
    output_ptr: i32,
    output_size: i32,
    actual_output_len_ptr: i32,
) -> i32 {
    unsafe {
        let input_data = slice::from_raw_parts(input_data_ptr as *const u8, input_data_len as usize);
        let input_schema = slice::from_raw_parts(input_schema_ptr as *const u8, input_schema_len as usize);

        let data: Value = match from_slice(input_data) {
            Ok(v) => v,
            Err(_) => return 1,  // Failed to parse input data
        };
        let schema: Value = match from_slice(input_schema) {
            Ok(v) => v,
            Err(_) => return 2,  // Failed to parse input schema
        };

        let mut result = serde_json::Map::new();

        for (key, schema_details) in schema["properties"].as_object().unwrap() {
            if let Some(column_data) = data.get(key) {
                if schema_details["type"] == "array"
                    && schema_details["items"]["type"] == "number"
                {
                    let numbers: Vec<f64> = column_data
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|v| v.as_f64().unwrap())
                        .collect();
                    let average = numbers.iter().sum::<f64>() / numbers.len() as f64;
                    let rounded_average = (average * 1_000_000.0).round() / 1_000_000.0;

                    // Directly store the rounded average under each column
                    result.insert(key.clone(), json!(rounded_average));
                }
            }
        }

        let output_data = match to_vec(&result) {
            Ok(v) => v,
            Err(_) => return 3,  // Failed to serialize output data
        };

        let output_size_usize = output_size as usize;
        if output_data.len() > output_size_usize {
            return 4;  // Output buffer too small
        }

        // Copy output_data to output_ptr
        let output_slice = slice::from_raw_parts_mut(output_ptr as *mut u8, output_size_usize);
        output_slice[..output_data.len()].copy_from_slice(&output_data);

        // Write the actual output length
        *(actual_output_len_ptr as *mut i32) = output_data.len() as i32;

        0  // Success
    }
}
