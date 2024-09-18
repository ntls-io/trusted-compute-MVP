use wasmtime::*;
use anyhow::Result;
use serde_json::Value;

pub fn wasm_execution(
    binary: &str,
    data: Value,
    schema: Value,
) -> Result<Value> { // Change return type to Result<Value>

    // Load the WASM module
    let engine = Engine::default();
    let module = Module::from_file(&engine, binary)?;
    let mut linker = Linker::new(&engine);

    let mut store = Store::new(&engine, ());

    // Create memory and add it to the linker under "env" namespace
    let memory_ty = MemoryType::new(17, None); // Minimum 1 page, no maximum
    let memory = Memory::new(&mut store, memory_ty)?;
    linker.define(&mut store, "env", "memory", memory.clone())?;

    // Instantiate the module
    let instance = linker.instantiate(&mut store, &module)?;

    // Get the exported functions
    let exec = instance
        .get_func(&mut store, "exec")
        .expect("`exec` was not an exported function");
    let exec_typed = exec.typed::<(i32, i32, i32, i32, i32, i32), i32>(&store)?;

    let free = instance
        .get_func(&mut store, "free")
        .expect("`free` was not an exported function");
    let free_typed = free.typed::<(i32, i32), ()>(&store)?;

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
        return Ok(Value::Null); // Return null or an appropriate error value
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

    // Deallocate the memory in the WASM module
    free_typed.call(&mut store, (output_ptr, output_len))?;

    // Return the result JSON
    Ok(result_json) // Return the JSON result
}
