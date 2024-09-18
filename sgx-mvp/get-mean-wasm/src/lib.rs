use serde_json::{Value, json, from_slice, to_vec};
use std::slice;
use std::alloc::{alloc, dealloc, Layout};

#[no_mangle]
pub extern "C" fn exec(
    input_data_ptr: i32,
    input_data_len: i32,
    input_schema_ptr: i32,
    input_schema_len: i32,
    output_ptr_ptr: i32,
    output_len_ptr: i32,
) -> i32 {
    unsafe {
        let input_data_ptr = input_data_ptr as usize;
        let input_data_len = input_data_len as usize;
        let input_schema_ptr = input_schema_ptr as usize;
        let input_schema_len = input_schema_len as usize;
        let output_ptr_ptr = output_ptr_ptr as *mut i32;
        let output_len_ptr = output_len_ptr as *mut i32;

        let input_data = slice::from_raw_parts(input_data_ptr as *const u8, input_data_len);
        let input_schema = slice::from_raw_parts(input_schema_ptr as *const u8, input_schema_len);

        let data: Value = match from_slice(input_data) {
            Ok(v) => v,
            Err(_) => return 1,
        };
        let schema: Value = match from_slice(input_schema) {
            Ok(v) => v,
            Err(_) => return 2,
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
                    result.insert(key.clone(), json!({ "Average": rounded_average }));
                }
            }
        }

        let output_data = match to_vec(&result) {
            Ok(v) => v,
            Err(_) => return 3,
        };

        let len = output_data.len();
        let ptr = alloc(Layout::from_size_align(len, 1).unwrap());
        if ptr.is_null() {
            return 4;
        }
        ptr.copy_from_nonoverlapping(output_data.as_ptr(), len);

        *(output_ptr_ptr) = ptr as i32;
        *(output_len_ptr) = len as i32;

        0 // Success
    }
}

#[no_mangle]
pub extern "C" fn free(ptr: i32, size: i32) {
    unsafe {
        let ptr = ptr as *mut u8;
        let size = size as usize;
        dealloc(ptr, Layout::from_size_align(size, 1).unwrap());
    }
}
