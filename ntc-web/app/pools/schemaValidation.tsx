/**
 * Nautilus Trusted Compute
 * Copyright (C) 2025 Nautilus
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import React from 'react';

interface ValidationResult {
  success: boolean;
  error: string | null;
}

export async function validateJsonSchema(schemaFile: File, dataFile: File): Promise<ValidationResult> {
  try {
    // Read schema file
    const schemaText = await schemaFile.text();
    let schema;
    try {
      schema = JSON.parse(schemaText);
    } catch (error) {
      return {
        success: false,
        error: 'The schema file contains invalid JSON. Please check for syntax errors like missing commas or quotes.'
      };
    }

    // Validate schema structure
    if (!schema || typeof schema !== 'object') {
      return {
        success: false,
        error: 'The schema must be a JSON object. Please make sure it starts with { } and contains proper field definitions.'
      };
    }

    if (!schema.type || !schema.properties) {
      return {
        success: false,
        error: 'The schema is missing required fields. It must include both "type" and "properties" fields to define the data structure.'
      };
    }

    // Read data file
    const dataText = await dataFile.text();
    let data;
    try {
      data = JSON.parse(dataText);
    } catch (error) {
      return {
        success: false,
        error: 'The data file contains invalid JSON. Please check for proper formatting and syntax.'
      };
    }

    // Validate data against schema
    const validationResult = validateDataAgainstSchema(data, schema);
    if (!validationResult.success) {
      return validationResult;
    }

    return {
      success: true,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      error: 'An unexpected error occurred during validation. Please try again or contact support if the issue persists.'
    };
  }
}

function validateDataAgainstSchema(data: any, schema: any): ValidationResult {
  // Validate type
  if (schema.type === 'object') {
    if (typeof data !== 'object' || Array.isArray(data)) {
      return {
        success: false,
        error: 'The data should be a JSON object, but received a different type. Please ensure your data is enclosed in curly braces { }.'
      };
    }

    // Validate required properties
    if (schema.required) {
      const missingFields: string[] = schema.required.filter((prop: string) => !(prop in data));
      if (missingFields.length > 0) {
        return {
          success: false,
          error: missingFields.length === 1
            ? `The required field "${missingFields[0]}" is missing from your data. Please add this field to proceed.`
            : `The following required fields are missing: ${missingFields.map((f: string) => `"${f}"`).join(', ')}. Please add these fields to proceed.`
        };
      }
    }

    // Validate properties
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if (propName in data) {
        const propValidation = validateProperty(data[propName], propSchema as any);
        if (!propValidation.success) {
          return {
            success: false,
            error: `Issue with field "${propName}": ${propValidation.error}`
          };
        }
      }
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(data)) {
      return {
        success: false,
        error: 'The data should be an array. Please ensure your data is enclosed in square brackets [ ].'
      };
    }

    // Validate array items
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        const itemValidation = validateProperty(data[i], schema.items);
        if (!itemValidation.success) {
          return {
            success: false,
            error: `Issue with item #${i + 1}: ${itemValidation.error}`
          };
        }
      }
    }
  }

  return {
    success: true,
    error: null
  };
}

function validateProperty(value: any, schema: any): ValidationResult {
  // Type validation
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') {
        return {
          success: false,
          error: 'This field should be a text value (enclosed in quotes).'
        };
      }
      // Validate string constraints
      if (schema.minLength && value.length < schema.minLength) {
        return {
          success: false,
          error: `This text is too short. It needs at least ${schema.minLength} characters.`
        };
      }
      if (schema.maxLength && value.length > schema.maxLength) {
        return {
          success: false,
          error: `This text is too long. It should not exceed ${schema.maxLength} characters.`
        };
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        return {
          success: false,
          error: 'This text doesn\'t match the required format pattern.'
        };
      }
      break;

    case 'number':
      if (typeof value !== 'number') {
        return {
          success: false,
          error: 'This field should be a number (without quotes).'
        };
      }
      // Validate number constraints
      if (schema.minimum !== undefined && value < schema.minimum) {
        return {
          success: false,
          error: `This number is too small. It must be ${schema.minimum} or greater.`
        };
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        return {
          success: false,
          error: `This number is too large. It must be ${schema.maximum} or less.`
        };
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return {
          success: false,
          error: 'This field should be either true or false (without quotes).'
        };
      }
      break;

    case 'object':
      return validateDataAgainstSchema(value, schema);

    case 'array':
      if (!Array.isArray(value)) {
        return {
          success: false,
          error: 'This field should be an array (enclosed in square brackets [ ]).'
        };
      }
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const itemValidation = validateProperty(value[i], schema.items);
          if (!itemValidation.success) {
            return {
              success: false,
              error: `Issue with item #${i + 1}: ${itemValidation.error}`
            };
          }
        }
      }
      break;

    default:
      return {
        success: false,
        error: `Unsupported data type: "${schema.type}". Please check the schema definition.`
      };
  }

  return {
    success: true,
    error: null
  };
}