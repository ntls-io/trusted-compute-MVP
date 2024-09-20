use wasmi::{
    Engine, Extern, Linker, Memory, MemoryType, Module, Store, Val,
};
use anyhow::{anyhow, Result};
use serde_json::Value as JsonValue;
use std::fs;

pub fn wasm_execution(
    binary: &str,
    data: JsonValue,
    schema: JsonValue,
) -> Result<JsonValue> {
    // Load the WASM binary
    let wasm_binary = fs::read(binary)?;

    // Create an engine and store
    let engine = Engine::default();
    let mut store = Store::new(&engine, ());

    // Compile the module
    let module = Module::new(&engine, &wasm_binary)?;

    // Create a linker
    let mut linker = Linker::new(&engine);

    // Create a memory type
    let memory_type = MemoryType::new(17, None)?;

    // Create a memory instance and add it to the linker
    let memory = Memory::new(&mut store, memory_type)?;
    linker.define("env", "memory", memory.clone())?;

    // Instantiate the module
    let instance_pre = linker.instantiate(&mut store, &module)?;
    let instance = instance_pre.ensure_no_start(&mut store)?;

    // Serialize input data
    let data_bytes = serde_json::to_vec(&data)?;
    let schema_bytes = serde_json::to_vec(&schema)?;

    // Write data into WASM memory
    let data_ptr: u32 = 0;
    let data_len = data_bytes.len() as u32;
    memory.write(&mut store, data_ptr as usize, &data_bytes)?;

    let schema_ptr = data_ptr + data_len;
    let schema_len = schema_bytes.len() as u32;
    memory.write(&mut store, schema_ptr as usize, &schema_bytes)?;

    // Prepare space for output buffer
    let output_ptr = schema_ptr + schema_len;
    let output_size = 1024 * 1024;  // 1MB buffer
    let output_len_ptr = output_ptr + output_size;

    // Ensure the memory is large enough
    let total_memory_size = output_len_ptr + 4;  // +4 bytes for actual_output_len_ptr
    let current_memory_size = memory.data_size(&store) as u32;
    if total_memory_size > current_memory_size {
        let additional_pages = ((total_memory_size - current_memory_size + 0xFFFF) / 0x10000) as u32;
        memory.grow(&mut store, additional_pages)?;
    }

    // Get the function `exec`
    let exec_func = instance
        .get_export(&mut store, "exec")
        .and_then(Extern::into_func)
        .ok_or_else(|| anyhow!("Failed to find `exec` function export"))?;

    // Prepare the function arguments
    let args = [
        Val::I32(data_ptr as i32),
        Val::I32(data_len as i32),
        Val::I32(schema_ptr as i32),
        Val::I32(schema_len as i32),
        Val::I32(output_ptr as i32),
        Val::I32(output_size as i32),
        Val::I32(output_len_ptr as i32),
    ];

    // Prepare a place to store the result
    let mut results = [Val::I32(0)];

    // Call the function
    exec_func.call(&mut store, &args, &mut results)?;

    // Check the result code
    let result_code = match results[0] {
        Val::I32(code) => code,
        _ => return Err(anyhow!("Invalid return value from WASM function")),
    };

    if result_code != 0 {
        eprintln!("Error executing WASM function: code {}", result_code);
        return Err(anyhow!("WASM function returned error code {}", result_code));
    }

    // Read the actual output length from WASM memory
    let mut actual_output_len_bytes = [0u8; 4];
    memory.read(&mut store, output_len_ptr as usize, &mut actual_output_len_bytes)?;
    let actual_output_len = i32::from_le_bytes(actual_output_len_bytes) as usize;

    // Read the output data from WASM memory
    let mut output_data = vec![0u8; actual_output_len];
    memory.read(&mut store, output_ptr as usize, &mut output_data)?;

    // Deserialize the output JSON
    let result_json: JsonValue = serde_json::from_slice(&output_data)?;

    // Return the result JSON
    Ok(result_json)
}
