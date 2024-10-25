// wasmi-impl/src/lib.rs

use wasmi::{Engine, Linker, Memory, MemoryType, Module, Store, Val};
use serde_json::Value as JsonValue;
use std::fs;
use anyhow::{anyhow, Result};

/// Define the error codes returned by the WASM modules
#[repr(i32)]
#[derive(Debug)]
pub enum WasmErrorCode {
    Success = 0,
    ParseInputData = 1,
    ParseSchema = 2,
    SerializeOutput = 3,
    OutputBufferTooSmall = 4,
    ExecutionFailed = 5,
    Unknown(i32), // For any undefined error codes
}

impl WasmErrorCode {
    /// Creates a `WasmErrorCode` from an `i32` code
    pub fn from_code(code: i32) -> Self {
        match code {
            0 => WasmErrorCode::Success,
            1 => WasmErrorCode::ParseInputData,
            2 => WasmErrorCode::ParseSchema,
            3 => WasmErrorCode::SerializeOutput,
            4 => WasmErrorCode::OutputBufferTooSmall,
            5 => WasmErrorCode::ExecutionFailed,
            other => WasmErrorCode::Unknown(other),
        }
    }

    /// Returns the `i32` code associated with the `WasmErrorCode`
    pub fn code(&self) -> i32 {
        match self {
            WasmErrorCode::Success => 0,
            WasmErrorCode::ParseInputData => 1,
            WasmErrorCode::ParseSchema => 2,
            WasmErrorCode::SerializeOutput => 3,
            WasmErrorCode::OutputBufferTooSmall => 4,
            WasmErrorCode::ExecutionFailed => 5,
            WasmErrorCode::Unknown(code) => *code,
        }
    }
}

// Implement the `From<i32>` trait for `WasmErrorCode`
impl From<i32> for WasmErrorCode {
    fn from(code: i32) -> Self {
        WasmErrorCode::from_code(code)
    }
}

impl std::fmt::Display for WasmErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WasmErrorCode::Success => write!(f, "Success"),
            WasmErrorCode::ParseInputData => write!(f, "Failed to parse input data"),
            WasmErrorCode::ParseSchema => write!(f, "Failed to parse input schema"),
            WasmErrorCode::SerializeOutput => write!(f, "Failed to serialize output data"),
            WasmErrorCode::OutputBufferTooSmall => write!(f, "Output buffer too small"),
            WasmErrorCode::ExecutionFailed => write!(f, "Execution of WASM function failed"),
            WasmErrorCode::Unknown(code) => write!(f, "Unknown error code: {}", code),
        }
    }
}

impl std::error::Error for WasmErrorCode {}

/// Executes a WASM binary with the provided JSON data and schema.
///
/// # Arguments
///
/// * `binary` - Path to the WASM binary.
/// * `data` - JSON data as `serde_json::Value`.
/// * `schema` - JSON schema as `serde_json::Value`.
///
/// # Returns
///
/// * `Ok(JsonValue)` containing the result if execution is successful.
/// * `Err(anyhow::Error)` containing the error if an error occurs.
pub fn wasm_execution(binary: &str, data: JsonValue, schema: JsonValue) -> Result<JsonValue> {
    // Load the WASM binary
    let wasm_binary = fs::read(binary)
        .map_err(|e| anyhow!("Failed to read WASM binary '{}': {}", binary, e))?;

    // Create an engine and store
    let engine = Engine::default();
    let mut store = Store::new(&engine, ());

    // Compile the module
    let module = Module::new(&engine, &wasm_binary)
        .map_err(|e| anyhow!("Failed to compile WASM module '{}': {}", binary, e))?;

    // Create a linker
    let mut linker = Linker::new(&engine);

    // Create a memory type (minimum 17 pages = 17 * 64KB = 1,088 KB)
    let memory_type = MemoryType::new(17, None)
        .map_err(|e| anyhow!("Failed to create memory type: {}", e))?;

    // Create a memory instance and add it to the linker
    let memory = Memory::new(&mut store, memory_type)
        .map_err(|e| anyhow!("Failed to create memory: {}", e))?;

    linker
        .define("env", "memory", memory.clone())
        .map_err(|e| anyhow!("Failed to define memory in linker: {}", e))?;

    // Instantiate the module
    let instance_pre = linker
        .instantiate(&mut store, &module)
        .map_err(|e| anyhow!("Failed to instantiate WASM module '{}': {}", binary, e))?;

    let instance = instance_pre
        .ensure_no_start(&mut store)
        .map_err(|e| anyhow!("Failed to ensure no start: {}", e))?;

    // Serialize input data and schema
    let data_bytes = serde_json::to_vec(&data)
        .map_err(|e| anyhow!("Failed to serialize input data: {}", e))?;

    let schema_bytes = serde_json::to_vec(&schema)
        .map_err(|e| anyhow!("Failed to serialize input schema: {}", e))?;

    // Write data into WASM memory
    let data_ptr: u32 = 0;
    let data_len = data_bytes.len() as u32;
    memory
        .write(&mut store, data_ptr as usize, &data_bytes)
        .map_err(|e| anyhow!("Failed to write input data to memory: {}", e))?;

    let schema_ptr = data_ptr + data_len;
    let schema_len = schema_bytes.len() as u32;
    memory
        .write(&mut store, schema_ptr as usize, &schema_bytes)
        .map_err(|e| anyhow!("Failed to write input schema to memory: {}", e))?;

    // Prepare space for output buffer
    let output_ptr = schema_ptr + schema_len;
    let output_size = 1024 * 1024; // 1MB buffer
    let output_len_ptr = output_ptr + output_size;

    // Ensure the memory is large enough
    let total_memory_size = output_len_ptr + 4; // +4 bytes for actual_output_len_ptr
    let current_memory_size = (memory.data_size(&store) * 65536) as u32; // Convert pages to bytes
    if total_memory_size > current_memory_size {
        let additional_bytes = total_memory_size - current_memory_size;
        let additional_pages = ((additional_bytes + 0xFFFF) / 0x10000) as u32; // Round up to the next page
        memory
            .grow(&mut store, additional_pages)
            .map_err(|e| anyhow!("Failed to grow memory: {}", e))?;
    }

    // Get the function `exec`
    let exec_func = instance
        .get_export(&mut store, "exec")
        .and_then(|ext| ext.into_func())
        .ok_or_else(|| anyhow!("Failed to find `exec` function export in '{}'", binary))?;

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
    exec_func
        .call(&mut store, &args, &mut results)
        .map_err(|e| anyhow!("Failed to execute `exec` function: {}", e))?;

    // Check the result code
    let result_code = match results[0] {
        Val::I32(code) => code,
        _ => return Err(anyhow!("Invalid return value from WASM function")),
    };

    if result_code != WasmErrorCode::Success.code() {
        // Map the error code to a WasmErrorCode variant
        let wasm_error = WasmErrorCode::from_code(result_code);
        // Return the error as anyhow::Error, embedding the WasmErrorCode
        return Err(anyhow!(wasm_error));
    }

    // Read the actual output length from WASM memory
    let mut actual_output_len_bytes = [0u8; 4];
    memory
        .read(&mut store, output_len_ptr as usize, &mut actual_output_len_bytes)
        .map_err(|e| anyhow!("Failed to read actual output length: {}", e))?;
    let actual_output_len = i32::from_le_bytes(actual_output_len_bytes) as usize;

    // Read the output data from WASM memory
    let mut output_data = vec![0u8; actual_output_len];
    memory
        .read(&mut store, output_ptr as usize, &mut output_data)
        .map_err(|e| anyhow!("Failed to read output data from memory: {}", e))?;

    // Deserialize the output JSON
    let result_json: JsonValue = serde_json::from_slice(&output_data)
        .map_err(|e| anyhow!("Failed to deserialize output JSON: {}", e))?;

    // Return the result JSON
    Ok(result_json)
}
