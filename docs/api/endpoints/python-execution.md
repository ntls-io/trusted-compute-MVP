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

# **Python Execution API**

Execute Python scripts (hosted on GitHub) within the SGX enclave on the secured data pool. The script must be verified using its SHA256 hash before execution.

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