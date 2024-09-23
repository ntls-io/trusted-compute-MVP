// wasmi-impl/src/lib.rs

use wasmi::{
    Engine, Extern, Linker, Memory, MemoryType, Module, Store, Val,
};
use serde_json::Value as JsonValue;
use std::fs;

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
    /// Returns the i32 code associated with the WasmErrorCode
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

impl From<i32> for WasmErrorCode {
    fn from(code: i32) -> Self {
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
/// * `Err(i32)` containing the error code if an error occurs.
pub fn wasm_execution(
    binary: &str,
    data: JsonValue,
    schema: JsonValue,
) -> std::result::Result<JsonValue, i32> {
    // Load the WASM binary
    let wasm_binary = match fs::read(binary) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("[!] Failed to read WASM binary '{}': {}", binary, e);
            return Err(WasmErrorCode::ExecutionFailed.code());
        }
    };

    // Create an engine and store
    let engine = Engine::default();
    let mut store = Store::new(&engine, ());

    // Compile the module
    let module = match Module::new(&engine, &wasm_binary) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[!] Failed to compile WASM module '{}': {}", binary, e);
            return Err(WasmErrorCode::ExecutionFailed.code());
        }
    };

    // Create a linker
    let mut linker = Linker::new(&engine);

    // Create a memory type (minimum 17 pages = 17 * 64KB = 1,088 KB)
    let memory_type = match MemoryType::new(17, None) {
        Ok(mt) => mt,
        Err(e) => {
            eprintln!("[!] Failed to create memory type: {}", e);
            return Err(WasmErrorCode::ExecutionFailed.code());
        }
    };

    // Create a memory instance and add it to the linker
    let memory = match Memory::new(&mut store, memory_type) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[!] Failed to create memory: {}", e);
            return Err(WasmErrorCode::ExecutionFailed.code());
        }
    };
    if let Err(e) = linker.define("env", "memory", memory.clone()) {
        eprintln!("[!] Failed to define memory in linker: {}", e);
        return Err(WasmErrorCode::ExecutionFailed.code());
    }

    // Instantiate the module
    let instance_pre = match linker.instantiate(&mut store, &module) {
        Ok(inst) => inst,
        Err(e) => {
            eprintln!("[!] Failed to instantiate WASM module '{}': {}", binary, e);
            return Err(WasmErrorCode::ExecutionFailed.code());
        }
    };

    let instance = match instance_pre.ensure_no_start(&mut store) {
        Ok(inst) => inst,
        Err(e) => {
            eprintln!("[!] Failed to ensure no start: {}", e);
            return Err(WasmErrorCode::ExecutionFailed.code());
        }
    };

    // Serialize input data and schema
    let data_bytes = match serde_json::to_vec(&data) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("[!] Failed to serialize input data: {}", e);
            return Err(WasmErrorCode::ParseInputData.code());
        }
    };

    let schema_bytes = match serde_json::to_vec(&schema) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("[!] Failed to serialize input schema: {}", e);
            return Err(WasmErrorCode::ParseSchema.code());
        }
    };

    // Write data into WASM memory
    let data_ptr: u32 = 0;
    let data_len = data_bytes.len() as u32;
    if let Err(e) = memory.write(&mut store, data_ptr as usize, &data_bytes) {
        eprintln!("[!] Failed to write input data to memory: {}", e);
        return Err(WasmErrorCode::ExecutionFailed.code());
    }

    let schema_ptr = data_ptr + data_len;
    let schema_len = schema_bytes.len() as u32;
    if let Err(e) = memory.write(&mut store, schema_ptr as usize, &schema_bytes) {
        eprintln!("[!] Failed to write input schema to memory: {}", e);
        return Err(WasmErrorCode::ExecutionFailed.code());
    }

    // Prepare space for output buffer
    let output_ptr = schema_ptr + schema_len;
    // TODO: Increase buffer size for larger outputs
    let output_size = 1024 * 1024;  // 1MB buffer
    let output_len_ptr = output_ptr + output_size;

    // Ensure the memory is large enough
    let total_memory_size = output_len_ptr + 4; // +4 bytes for actual_output_len_ptr
    let current_memory_size = (memory.data_size(&store) * 65536) as u32; // Convert pages to bytes
    if total_memory_size > current_memory_size {
        let additional_bytes = total_memory_size - current_memory_size;
        let additional_pages = ((additional_bytes + 0xFFFF) / 0x10000) as u32; // Round up to the next page
        if let Err(e) = memory.grow(&mut store, additional_pages) {
            eprintln!("[!] Failed to grow memory: {}", e);
            return Err(WasmErrorCode::ExecutionFailed.code());
        }
    }

    // Get the function `exec`
    let exec_func = match instance.get_export(&mut store, "exec") {
        Some(Extern::Func(f)) => f,
        _ => {
            eprintln!("[!] Failed to find `exec` function export in '{}'", binary);
            return Err(WasmErrorCode::ExecutionFailed.code());
        }
    };

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
    if let Err(e) = exec_func.call(&mut store, &args, &mut results) {
        eprintln!("[!] Failed to execute `exec` function: {}", e);
        return Err(WasmErrorCode::ExecutionFailed.code());
    }

    // Check the result code
    let result_code = match results[0] {
        Val::I32(code) => code,
        _ => {
            eprintln!("[!] Invalid return value from WASM function");
            return Err(WasmErrorCode::ExecutionFailed.code());
        }
    };

    if result_code != WasmErrorCode::Success.code() {
        // WASM function returned an error code
        return Err(result_code);
    }

    // Read the actual output length from WASM memory
    let mut actual_output_len_bytes = [0u8; 4];
    if let Err(e) = memory.read(&mut store, output_len_ptr as usize, &mut actual_output_len_bytes) {
        eprintln!("[!] Failed to read actual output length: {}", e);
        return Err(WasmErrorCode::ExecutionFailed.code());
    }
    let actual_output_len = i32::from_le_bytes(actual_output_len_bytes) as usize;

    // Read the output data from WASM memory
    let mut output_data = vec![0u8; actual_output_len];
    if let Err(e) = memory.read(&mut store, output_ptr as usize, &mut output_data) {
        eprintln!("[!] Failed to read output data from memory: {}", e);
        return Err(WasmErrorCode::ExecutionFailed.code());
    }

    // Deserialize the output JSON
    let result_json: JsonValue = match serde_json::from_slice(&output_data) {
        Ok(json) => json,
        Err(e) => {
            eprintln!("[!] Failed to deserialize output JSON: {}", e);
            return Err(WasmErrorCode::SerializeOutput.code());
        }
    };

    // Return the result JSON
    Ok(result_json)
}
