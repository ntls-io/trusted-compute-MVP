use serde_json::{Value, json, from_slice, to_vec};
extern crate alloc;
use alloc::vec::Vec;

pub fn exec(
    input_data: &[u8],
    input_schema: &[u8],
) -> Vec<u8> {
    let data: Value = from_slice(input_data).expect("Failed to deserialize data");
    let schema: Value = from_slice(input_schema).expect("Failed to deserialize schema");

    let mut result = serde_json::Map::new();

    for (key, schema_details) in schema["properties"].as_object().unwrap() {
        if let Some(column_data) = data.get(key) {
            if schema_details["type"] == "array" && schema_details["items"]["type"] == "number" {
                let numbers: Vec<f64> = column_data
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_f64().unwrap())
                    .collect();
                let average = numbers.iter().sum::<f64>() / numbers.len() as f64;
                // Format the average to 6 decimal places
                let rounded_average = format!("{:.6}", average).parse::<f64>().unwrap();
                result.insert(key.clone(), json!({"Average": rounded_average}));
            }
        }
    }

    to_vec(&result).expect("Failed to serialize result")
}


#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json}; // For working with JSON data.

    #[test]
    fn test_exec_function() {
        // Prepare test data and schema as JSON
        let json_data = json!({
            "Column_1": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0],
        });

        let schema = json!({
            "properties": {
                "Column_1": {
                    "type": "array",
                    "items": { "type": "number" }
                }
            }
        });

        let serialized_data = serde_json::to_vec(&json_data).unwrap();
        let serialized_schema = serde_json::to_vec(&schema).unwrap();

        // Call the exec function
        let result = exec(&serialized_data, &serialized_schema);

        // Deserialize the result
        let deserialized_json_data: Value = serde_json::from_slice(&result)
            .expect("Failed to deserialize output JSON");

        // Convert the result to a pretty JSON string
        let pretty_json = serde_json::to_string_pretty(&deserialized_json_data)
            .expect("Failed to convert to pretty JSON");

        // Print the result for verification
        println!("Deserialized JSON: {}", pretty_json);

        // Verify the result
        assert!(deserialized_json_data.get("Column_1").unwrap().get("Average").is_some());
    }

    #[test]
    fn test_exec_two_function() {
        let json_data = json!({
            "Column_1": [8.1, 6.1, 3.0, 3.0, 7.0, 1.0, 9.0],
            "Column_2": [8.1, 6.1, 5.0, 3.0, 7.0, 7.0, 9.0],
            "Column_3": [2.0, 5.0, 5.0, 5.0, 5.0, 5.0, 6.0, 7.0, 4.0, 4.0, 4.0, 4.0, 4.0],
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
                }
            }
        });

        let serialized_data = serde_json::to_vec(&json_data).unwrap();
        let serialized_schema = serde_json::to_vec(&schema).unwrap();

        // Call the exec function
        let result = exec(&serialized_data, &serialized_schema);

        // Deserialize the result
        let deserialized_json_data: Value = serde_json::from_slice(&result)
            .expect("Failed to deserialize output JSON");

        // Convert the result to a pretty JSON string
        let pretty_json = serde_json::to_string_pretty(&deserialized_json_data)
            .expect("Failed to convert to pretty JSON");

        println!("Deserialized data: {}", pretty_json);

        // Now, you can correctly assert using deserialized_json_data
        assert!(deserialized_json_data.get("Column_1").unwrap().get("Average").is_some());
        assert!(deserialized_json_data.get("Column_2").unwrap().get("Average").is_some());
        assert!(deserialized_json_data.get("Column_3").unwrap().get("Average").is_some());
    }
}

