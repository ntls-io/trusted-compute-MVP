use anyhow::{anyhow, Result};
use serde_json::Value;

/// Function to validate that two JSON schemas match
pub fn validate_json_schemas(schema1: &Value, schema2: &Value) -> bool {
    // Check if both schemas are objects
    if schema1.is_object() && schema2.is_object() {
        let obj1 = schema1.as_object().unwrap();
        let obj2 = schema2.as_object().unwrap();

        // Compare the keys and their structure (properties, required, etc.)
        if let Some(props1) = obj1.get("properties").and_then(|p| p.as_object()) {
            if let Some(props2) = obj2.get("properties").and_then(|p| p.as_object()) {
                // Compare the properties in both schemas
                if props1.keys().collect::<Vec<_>>() != props2.keys().collect::<Vec<_>>() {
                    return false;
                }
                // Compare each property's structure
                for key in props1.keys() {
                    if !compare_schema_values(&props1[key], &props2[key]) {
                        return false;
                    }
                }
            } else {
                return false;
            }
        }

        // Compare the required fields
        let required1 = obj1.get("required").and_then(|r| r.as_array());
        let required2 = obj2.get("required").and_then(|r| r.as_array());

        if required1 != required2 {
            return false;
        }

        true
    } else {
        false
    }
}

/// Recursive function to compare schema values (types and structure)
fn compare_schema_values(value1: &Value, value2: &Value) -> bool {
    match (value1, value2) {
        (Value::Object(obj1), Value::Object(obj2)) => {
            // Ensure both objects have the same keys
            if obj1.keys().collect::<Vec<_>>() != obj2.keys().collect::<Vec<_>>() {
                return false;
            }
            // Recursively compare each value
            for key in obj1.keys() {
                if !compare_schema_values(&obj1[key], &obj2[key]) {
                    return false;
                }
            }
            true
        }
        (Value::Array(arr1), Value::Array(arr2)) => {
            // Check if both arrays contain the same structure
            if arr1.len() != arr2.len() {
                return false;
            }
            for (item1, item2) in arr1.iter().zip(arr2.iter()) {
                if !compare_schema_values(item1, item2) {
                    return false;
                }
            }
            true
        }
        // Compare basic types like numbers, strings, etc.
        (Value::String(s1), Value::String(s2)) => s1 == s2,
        (Value::Number(n1), Value::Number(n2)) => n1 == n2,
        (Value::Bool(b1), Value::Bool(b2)) => b1 == b2,
        (Value::Null, Value::Null) => true,
        _ => false,
    }
}

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
