# Health Check API

A simple endpoint to verify that the server is running and responsive.

## Endpoint

```sh
GET /health
```

## Headers
None required

## Response

### Success Response

Status Code: `200 OK`

### Content

```sh
Server is running
```

## Error Response

### In case of server issues:

Status Code: `500 Internal Server Error`

### Content

```sh
"error": "Error message details"
```