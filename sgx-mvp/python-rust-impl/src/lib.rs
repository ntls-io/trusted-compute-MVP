// Nautilus Trusted Compute
// Copyright (C) 2025 Nautilus
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use anyhow::Result;
use pyo3::prelude::*;
use pyo3::types::PyDict;
use serde_json::Value;

pub fn run_python(json_data: &Value, py_file_path: &'static str) -> Result<Value> {
    Python::with_gil(|py| {
        // Open and read the Python file contents
        let code = std::fs::read_to_string(py_file_path)
            .map_err(|e| anyhow::anyhow!("Failed to read Python script: {}", e))?;

        // Create a Python dictionary to hold the data
        let locals = PyDict::new(py);

        // Convert the JSON data to a string and set it in the Python locals
        locals.set_item("data", serde_json::to_string(json_data)?)?;

        // Run the Python code from the file in the current Python context
        py.run(&code, None, None)?;

        // Execute the mean calculation in the current context
        let result: String = py
            .eval("exec(json.loads(data))", None, Some(locals))?
            .extract()?;

        // Parse the result back into a Rust serde_json::Value
        let python_result: Value = serde_json::from_str(&result)?;

        Ok(python_result)
    })
}
