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

# **Data Pool APIs**

The Data Pool APIs allow you to create and manage data pools within the SGX enclave.

## Create Data Pool

Creates a new data pool with the provided data, pending DRT verification.

### Endpoint

```sh
POST /create_data_pool
```

### Headers

Content-Type: `application/json`

### Request Body

```json
{
    "data": {
        "Column_1": [
            "value1",
            "value2",
            "value3"
        ],
        "Column_2": [
            "valueA",
            "valueB",
            "valueC"
        ]
    }
}
```

### Response

**Success Response:**

Status Code: `200 OK`

Content:

```sh
Data sealed and saved successfully
```

### Error Response

**In case of server issues:**

Status Code: `500 Internal Server Error`

Content:

```sh
"error": "Error message details"
```

---

## Append Data Pool

Appends new data to an existing data pool, pending DRT verification.

### Endpoint

```sh
POST /append_data
```

### Headers

Content-Type: `application/json`

### Request Body

```json
{
    "data": {
        "Column_1": [
            "new_value1",
            "new_value2"
        ],
        "Column_2": [
            "new_valueA",
            "new_valueB"
        ]
    }
}
```

### Response

**Success Response:**

Status Code: `200 OK`

Content:

```sh
Data merged, sealed, and saved successfully
```

### Error Response

**In case of server issues:**

Status Code: `500 Internal Server Error`

Content:

```sh
"error": "Error message details"
```