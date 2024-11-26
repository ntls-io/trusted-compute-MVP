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