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

use anyhow::{anyhow, Result};
use serde_json::Value;

/// Function to append second JSON's columnar data to the first, expanding the columns
pub fn append_json(json1: &Value, json2: &Value) -> Result<Value> {
    // Ensure both inputs are objects with arrays as values
    if !json1.is_object() || !json2.is_object() {
        return Err(anyhow!("JSON data should be objects with arrays as values"));
    }

    let obj1 = json1
        .as_object()
        .ok_or_else(|| anyhow!("Expected an object in json1"))?;
    let obj2 = json2
        .as_object()
        .ok_or_else(|| anyhow!("Expected an object in json2"))?;

    let mut merged_data = json1.clone();

    for (key, value) in obj2 {
        if let Some(arr1) = obj1.get(key).and_then(|v| v.as_array()) {
            if let Some(arr2) = value.as_array() {
                // Concatenate the two arrays and store them in the merged data
                let mut combined_array = arr1.clone();
                combined_array.extend(arr2.clone());

                if let Some(merged_obj) = merged_data.as_object_mut() {
                    merged_obj.insert(key.clone(), Value::Array(combined_array));
                } else {
                    return Err(anyhow!("Merged data is not an object"));
                }
            } else {
                return Err(anyhow!("Expected an array for key '{}' in json2", key));
            }
        } else {
            return Err(anyhow!("Expected an array for key '{}' in json1", key));
        }
    }

    Ok(merged_data)
}
