# Python Execution API

Execute Python scripts (hosted on GitHub) within the SGX enclave on the secured data pool.
The script must be verified using its SHA256 hash before execution.

## Endpoint

```sh
POST /execute_python
```

## Headers

Content-Type: `application/json`

## Request Body

```json
{
    "github_url": "URL to the Python script on GitHub",
    "expected_hash": "SHA256 hash of the Python script"
}
```

## Response

### Success Response

Status Code: `200 OK`

### Content

```json
{
    "result": {
        "Column_1": "computed_value1",
        "Column_2": "computed_value2"
    }
}
```

## Error Response

### In case of server issues:

Status Code: `500 Internal Server Error`

### Content

```sh
"error": "Error message details"
```