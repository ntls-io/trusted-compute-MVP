# json-schema-validator

## Vue Mixin for Validating JSON Data Against a JSON Schema
This Vue mixin provides functionality for validating JSON data against a JSON schema. It uses the Ajv library for JSON schema validation.

Installation
To use this mixin in your Vue project, you can install the ajv library via npm:

```
npm install ajv --save
```
Then, copy the code for the mixin (found in the validateMixin.js file) into a file in your Vue project.

## Usage
To use this mixin, you can import it into any Vue component where you want to perform JSON schema validation. You can then use the validateDataAgainstSchema method to validate JSON data against a schema.

## Test files
You can find all the example json schema and data files in `json-files`

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
```

### Compiles and minifies for production
```
npm run build
```

### Lints and fixes files
```
npm run lint
```

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).

### License
This Vue mixin is released under the MIT License.