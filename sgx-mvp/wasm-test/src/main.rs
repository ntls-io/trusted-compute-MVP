use wasmtime::*;
use anyhow::Result;
use serde_json::{json, Value};

fn main() -> Result<()> {
    // Load the WASM module
    let engine = Engine::default();
    let module = Module::from_file(&engine, "../bin/get_mean_wasm.wasm")?;
    let mut linker = Linker::new(&engine);

    let mut store = Store::new(&engine, ());

    // Create memory and add it to the linker under "env" namespace
    let memory_ty = MemoryType::new(17, None); // Minimum 1 page, no maximum
    let memory = Memory::new(&mut store, memory_ty)?;
    linker.define(&mut store, "env", "memory", memory.clone())?;

    // Instantiate the module
    let instance = linker.instantiate(&mut store, &module)?;

    // Now we can proceed to use the memory and call the functions
    // Get the exported functions
    let exec = instance
        .get_func(&mut store, "exec")
        .expect("`exec` was not an exported function");
    let exec_typed = exec.typed::<(i32, i32, i32, i32, i32, i32), i32>(&store)?;

    let free = instance
        .get_func(&mut store, "free")
        .expect("`free` was not an exported function");
    let free_typed = free.typed::<(i32, i32), ()>(&store)?;

    // Prepare input data for 4 columns with 20 values each
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

    // Serialize input data
    let data_bytes = serde_json::to_vec(&data)?;
    let schema_bytes = serde_json::to_vec(&schema)?;

    // Compute pointers and write data into WASM memory
    let data_ptr: i32 = 0;
    let data_len = data_bytes.len() as i32;
    memory.write(&mut store, data_ptr as usize, &data_bytes)?;

    let schema_ptr = data_ptr + data_len;
    let schema_len = schema_bytes.len() as i32;
    memory.write(&mut store, schema_ptr as usize, &schema_bytes)?;

    // Prepare space for output pointer and length
    let output_ptr_ptr = schema_ptr + schema_len;
    let output_len_ptr = output_ptr_ptr + 4; // Assuming 4 bytes for the pointer size

    // Ensure the memory is large enough
    let total_memory_size = output_len_ptr + 4; // +4 bytes for the length
    if (total_memory_size as usize) > memory.data_size(&store) {
        let additional_pages = ((total_memory_size as usize - memory.data_size(&store)) / (64 * 1024)) + 1;
        memory.grow(&mut store, additional_pages as u64)?;
    }

    // Call the `exec` function
    let result = exec_typed.call(
        &mut store,
        (
            data_ptr,
            data_len,
            schema_ptr,
            schema_len,
            output_ptr_ptr,
            output_len_ptr,
        ),
    )?;

    // Check the result code
    if result != 0 {
        eprintln!("Error executing WASM function: code {}", result);
        return Ok(());
    }

    // Read the output pointer and length from WASM memory
    let mut output_ptr_bytes = [0u8; 4];
    memory.read(&mut store, output_ptr_ptr as usize, &mut output_ptr_bytes)?;
    let output_ptr = i32::from_le_bytes(output_ptr_bytes);

    let mut output_len_bytes = [0u8; 4];
    memory.read(&mut store, output_len_ptr as usize, &mut output_len_bytes)?;
    let output_len = i32::from_le_bytes(output_len_bytes);

    // Read the output data from WASM memory
    let mut output_data = vec![0u8; output_len as usize];
    memory.read(&mut store, output_ptr as usize, &mut output_data)?;

    // Deserialize the output JSON
    let result_json: Value = serde_json::from_slice(&output_data)?;

    // Print the result
    println!("Result: {}", serde_json::to_string_pretty(&result_json)?);

    // Deallocate the memory in the WASM module
    free_typed.call(&mut store, (output_ptr, output_len))?;

    Ok(())
}
