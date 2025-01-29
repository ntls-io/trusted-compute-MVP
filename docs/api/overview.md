<!--
Nautilus Trusted Compute  
Copyright (C) 2025 Nautilus  

This program is free software: you can redistribute it and/or modify  
it under the terms of the GNU Affero General Public License as published  
by the Free Software Foundation, either version 3 of the License, or  
(at your option) any later version.  

This program is distributed in the hope that it will be useful,  
but WITHOUT ANY WARRANTY; without even the implied warranty of  
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the  
GNU Affero General Public License for more details.  

You should have received a copy of the GNU Affero General Public License  
along with this program. If not, see <https://www.gnu.org/licenses/>.  
-->

# **Overview**

The Nautilus MVP provides a REST API for interacting with the SGX enclave and performing secure data operations. All endpoints are served over HTTPS and support remote attestation (RA-TLS).

## Base URL

```
https://127.0.0.1:8080
```

## Authentication
Currently, the API does not require authentication. However, all connections must optionally pass SGX remote attestation verification.

## Response Format

Responses are in JSON format, unless otherwise specified. The general structure is:

```json
{
    "result": {}, // Success response data
    "error": ""   // Error message if applicable
}
```

## Common HTTP Status Codes

* `200 OK`: Request successful
* `400 Bad Request`: Invalid request parameters
* `500 Internal Server Error`: Server-side error

## API Endpoints

| Endpoint         | Method | Description                |
|------------------|--------|----------------------------|
| `/health`        | GET    | Health check endpoint      |
| `/create_data_pool` | POST   | Create a new data pool     |
| `/append_data`   | POST   | Append data to existing pool |
| `/execute_python`| POST   | Execute Python script      |
| `/execute_wasm`  | POST   | Execute WASM binary        |

## Postman Collection

A Postman collection is available for testing. See the [Postman Guide](postman-collection/usage-guide.md) for details.