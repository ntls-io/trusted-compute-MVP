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

# **Postman Collection Guide**

This guide helps you get started with testing the Nautilus MVP APIs using Postman.

## Collection Overview

The Postman collection includes pre-configured requests for all API endpoints:

- Health Check
- Data Pool Creation
- Data Append
- Python Execution
- WASM Execution

## Setup Instructions

### 1. Import Collection

#### 1.1 **Locate Collection File**

* Find `postman/collection.json` in the repository
* This file contains all predefined API requests

#### 1.2 **Import into Postman**

```text
   1. Open Postman
   2. Click "Import" button
   3. Drag and drop collection.json OR
   4. Click "Upload Files" and select collection.json
```

### 2. Configure Environment

#### 2.1 **Create Environment**
```text
   1. Click "Environments" in Postman
   2. Click "Create Environment"
   3. Name it "Nautilus MVP" or another suitable name
```

#### 2.2 **Set Variables**
   ```text
   HOST: 127.0.0.1
   PORT: 8080
   BASE_URL: https://{{HOST}}:{{PORT}}
   ```

## Using the Collection

### Health Check

1. **Request**: `GET {{BASE_URL}}/health`
2. **Expected Response**: "Server is running"
3. **Purpose**: Verify server availability

```
// Example Response
Server is running
```

### Create Data Pool

1. **Request**: `POST {{BASE_URL}}/create_data_pool`
2. **Body Example**:
```json
{
    "data": {
        "temperature": [20.5, 21.0, 22.1],
        "humidity": [45, 48, 52]
    }
}
```

### Append Data

1. **Request**: `POST {{BASE_URL}}/append_data`
2. **Body Example**:
```json
{
    "data": {
        "temperature": [22.5, 23.0],
        "humidity": [49, 51]
    }
}
```

### Execute Python

1. **Request**: `POST {{BASE_URL}}/execute_python`
2. **Body Example**:
```json
{
  "github_url": "https://github.com/ntls-io/Python-Scripts-MVP/blob/main/calculate_mean.py",
  "expected_hash": "d1bb84ecf1f107013df0fe5ea8a63c15bbd673a81a13a6871c6b43d7e85fd690"
}
```

### Execute WASM

1. **Request**: `POST {{BASE_URL}}/execute_wasm`
2. **Body Example**:
```json
{
  "github_url": "https://github.com/ntls-io/WASM-Binaries-MVP/blob/master/bin/get_mean_wasm.wasm",
  "expected_hash": "b5ee81a20256dec2bd3db6e673b11eadae4baf8fafbe68cec1f36517bb569255",
  "json_schema": {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "Column_1": {
                "type": "array",
                "items": {
                    "type": "number"
                }
            },
            "Column_2": {
                "type": "array",
                "items": {
                    "type": "number"
                }
            }
        },
        "required": [
            "Column_1",
            "Column_2"
        ]
    }
}

```

## Testing Workflows

### Basic Workflow

#### 1. **Health Check**
   - Verify server is running
   - Check attestation is working

#### 2. **Data Operations**
   ```
   1. Create initial data pool
   2. Append additional data
   3. Verify data through computation
   ```

#### 3. **Computation Tests**
   ```
   1. Run Python analysis
   2. Run WASM analysis
   3. Compare results
   ```

## Troubleshooting

### Common Issues

#### 1. **SSL/TLS Errors**
   - Solution: Disable SSL verification in Postman
   - Note: Only for development/testing

#### 2. **Connection Refused**
   - Check server status
   - Verify port number

#### 3. **Invalid Responses**
   - Verify JSON format
   - Check content-type headers
   - Validate data structure