# **WebAssembly Execution API**

Execute WebAssembly (WASM) binaries (hosted on GitHub) within the SGX enclave on the secured data pool. The binary must be verified using its SHA256 hash before execution. The API also requires the JSON schema.

## Endpoint

```sh
POST /execute_wasm
```

## Headers

Content-Type: `application/json`

## Request Body

```json
{
    "github_url": "URL to the WASM binary on GitHub",
    "expected_hash": "SHA256 hash of the WASM binary",
    "json_schema": ...
}
```

## Response

**Success Response:**

Status Code: `200 OK`

Content:

```json
{
    "result": {
        "Column_1": "computed_value1",
        "Column_2": "computed_value2"
    }
}
```

## Error Response

**In case of server issues:**

Status Code: `500 Internal Server Error`

Content:

```sh
"error": "Error message details"
```