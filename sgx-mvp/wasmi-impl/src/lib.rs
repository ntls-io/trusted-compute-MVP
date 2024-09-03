use wasmi::{Engine, Extern, Linker, Memory, MemoryType, Module, Store};

#[derive(Debug)]
pub enum ExecWasmError {
    ExecutionError,
    MemoryError,
}

pub const ENTRYPOINT: &str = "exec";

pub fn exec_wasm_with_data(
    binary: &[u8],
    data: &[u8],
    result_buffer: &mut [u8],
) -> Result<(), ExecWasmError> {
    let engine = Engine::default();
    let module = Module::new(&engine, binary).map_err(|_| ExecWasmError::ExecutionError)?;

    let mut store = Store::new(&engine, ());

    let data_size = data.len();
    let result_size = result_buffer.len();
    let total_memory_required = data_size + result_size;
    let total_pages_required = (total_memory_required + 65535) / 65536; // Rounding up to nearest page

    let memory_type = MemoryType::new(1, Some(total_pages_required as u32))
        .map_err(|_| ExecWasmError::MemoryError)?;
    let memory = Memory::new(&mut store, memory_type).map_err(|_| ExecWasmError::MemoryError)?;

    let mut linker = Linker::new(&engine);
    linker
        .define("env", "memory", Extern::Memory(memory.clone()))
        .map_err(|_| ExecWasmError::ExecutionError)?;

    let instance = linker
        .instantiate(&mut store, &module)
        .map_err(|_| ExecWasmError::ExecutionError)?
        .start(&mut store)
        .map_err(|_| ExecWasmError::ExecutionError)?;

    let input_offset = 0;
    let result_buffer_offset = data_size as u32; // Reserve space after input data

    memory
        .write(&mut store, input_offset as usize, data)
        .map_err(|_| ExecWasmError::MemoryError)?;

    let func = instance
        .get_func(&mut store, ENTRYPOINT)
        .ok_or(ExecWasmError::ExecutionError)?
        .typed::<(i32, i32, i32), ()>(&store)
        .map_err(|_| ExecWasmError::ExecutionError)?;

    func.call(
        &mut store,
        (input_offset as i32, data_size as i32, result_buffer_offset as i32),
    )
    .map_err(|_| ExecWasmError::ExecutionError)?;

    memory
        .read(&store, result_buffer_offset as usize, result_buffer)
        .map_err(|_| ExecWasmError::MemoryError)?;

    Ok(())
}



#[cfg(test)]
mod tests {
    use super::*;
    use wabt;
    use std::convert::TryInto; 

    fn compile_wasm() -> Vec<u8> {
        wabt::wat2wasm(r#"
            (module
                (import "env" "memory" (memory 1))
                (func $exec (export "exec")
                    (param $input_ptr i32) (param $input_len i32) (param $output_ptr i32)
                    ;; Assuming serialization of [1.0, 2.0, 3.0] f32 values into bytes is done externally
                    ;; and we're directly storing these bytes into memory for demonstration.
                    
                    ;; Example byte representation of 1.0 as f32 in little-endian
                    (i32.store8 (get_local $output_ptr) (i32.const 0x00))
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 1)) (i32.const 0x00))
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 2)) (i32.const 0x80))
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 3)) (i32.const 0x3F))
                    
                    ;; Increment output_ptr by 4 bytes for the next f32 value
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 4)) (i32.const 0x00))
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 5)) (i32.const 0x00))
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 6)) (i32.const 0x00))
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 7)) (i32.const 0x40))
                    
                    ;; Increment output_ptr by 8 bytes for the next f32 value
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 8)) (i32.const 0x00))
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 9)) (i32.const 0x00))
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 10)) (i32.const 0x40))
                    (i32.store8 (i32.add (get_local $output_ptr) (i32.const 11)) (i32.const 0x40))
                )
            )
        "#).expect("Failed to compile WAT to WASM")
    }

    fn compile_wasm_for_mean() -> Vec<u8> {
        wabt::wat2wasm(r#"
            (module
                (import "env" "memory" (memory 1))
                (func $exec (export "exec")
                    (param $input_ptr i32) (param $input_len i32) (param $output_ptr i32)
                    (local $sum i32)
                    (local $mean f32)
                    (local $i i32)

                    ;; Initialize sum to 0
                    (set_local $sum (i32.const 0))

                    ;; Initialize loop counter to 0
                    (set_local $i (i32.const 0))

                    (block $exit
                        (loop $loop
                            ;; If i >= input_len, exit the loop
                            (br_if $exit (i32.ge_u (get_local $i) (get_local $input_len)))

                            ;; Load byte from memory and add to sum
                            (set_local $sum
                                (i32.add
                                    (get_local $sum)
                                    (i32.load8_u
                                        (i32.add (get_local $input_ptr) (get_local $i))
                                    )
                                )
                            )
                            ;; Increment i
                            (set_local $i (i32.add (get_local $i) (i32.const 1)))

                            ;; Continue the loop
                            (br $loop)
                        )
                    )

                    ;; Calculate the mean (sum / number of elements)
                    (set_local $mean
                        (f32.div
                            (f32.convert_i32_s (get_local $sum))
                            (f32.convert_i32_s (get_local $input_len))
                        )
                    )

                    ;; Store the result (mean) in the output buffer
                    (f32.store (get_local $output_ptr) (get_local $mean))
                )
            )
        "#).expect("Failed to compile WAT to WASM")
    }

    #[test]
    fn exec_wasm_works() {
        let wasm_binary = compile_wasm();
        let input_data: Vec<u8> = vec![1, 2, 3, 4, 5, 6, 7, 8];
        let mut result_buffer: Vec<u8> = vec![0; 12];

        exec_wasm_with_data(&wasm_binary, &input_data, &mut result_buffer)
            .expect("WASM execution failed");

        assert_eq!(
            &result_buffer,
            &[0, 0, 128, 63, 0, 0, 0, 64, 0, 0, 64, 64],
            "Unexpected result in the buffer"
        );
    }

    #[test]
    fn small_input_large_output() {
        let wasm_binary = compile_wasm();
        let input_data: Vec<u8> = vec![1, 2, 3, 4];
        let mut result_buffer: Vec<u8> = vec![0; 4096];

        exec_wasm_with_data(&wasm_binary, &input_data, &mut result_buffer)
            .expect("WASM execution failed");

        // Verify that the first 12 bytes contain the expected result and the rest are zero
        assert_eq!(
            &result_buffer[..12],
            &[0, 0, 128, 63, 0, 0, 0, 64, 0, 0, 64, 64],
            "Unexpected result in the first 12 bytes of the buffer"
        );

        assert_eq!(
            &result_buffer[12..],
            vec![0; 4096 - 12].as_slice(),
            "The rest of the buffer should be zero"
        );
    }

    #[test]
    fn exact_fit() {
        let wasm_binary = compile_wasm();
        let input_data: Vec<u8> = vec![0; 2048];
        let mut result_buffer: Vec<u8> = vec![0; 2048];

        exec_wasm_with_data(&wasm_binary, &input_data, &mut result_buffer)
            .expect("WASM execution failed");

        // No specific output to check, just ensure that it fits without error.
        // Optional: Add checks if expected results are defined.
        assert_eq!(
            result_buffer.len(),
            2048,
            "Result buffer should exactly fit the allocated size"
        );
    }

    #[test]
    fn large_input_small_output() {
        let wasm_binary = compile_wasm();
        let input_data: Vec<u8> = vec![0; 4096];
        let mut result_buffer: Vec<u8> = vec![0; 8];

        exec_wasm_with_data(&wasm_binary, &input_data, &mut result_buffer)
            .expect("WASM execution failed");

        // Check only the small output buffer.
        assert_eq!(
            &result_buffer,
            &[0, 0, 128, 63, 0, 0, 0, 64],
            "Unexpected result in the small output buffer"
        );
    }

    #[test]
    fn oversized_result_buffer() {
        let wasm_binary = compile_wasm();
        let input_data: Vec<u8> = vec![1, 2, 3, 4];
        let mut result_buffer: Vec<u8> = vec![0; 8192];

        exec_wasm_with_data(&wasm_binary, &input_data, &mut result_buffer)
            .expect("WASM execution failed");

        // Verify that the first 12 bytes contain the expected result and the rest are zero
        assert_eq!(
            &result_buffer[..12],
            &[0, 0, 128, 63, 0, 0, 0, 64, 0, 0, 64, 64],
            "Unexpected result in the first 12 bytes of the oversized buffer"
        );

        assert_eq!(
            &result_buffer[12..],
            vec![0; 8192 - 12].as_slice(),
            "The rest of the oversized buffer should be zero"
        );
    }

    #[test]
    fn calculate_mean() {
        let wasm_binary = compile_wasm_for_mean();
        let input_data: Vec<u8> = vec![1, 2, 3, 4, 5, 6, 7, 8];
        let mut result_buffer: Vec<u8> = vec![0; 4]; // Assuming the mean is stored as a single f32 value (4 bytes)

        exec_wasm_with_data(&wasm_binary, &input_data, &mut result_buffer)
            .expect("WASM execution failed");

        // Convert the result buffer to f32
        let mean_value = f32::from_le_bytes(result_buffer.try_into().expect("Invalid f32 bytes"));

        assert_eq!(
            mean_value, 
            4.5, 
            "The calculated mean is incorrect"
        );
    }

    

}

