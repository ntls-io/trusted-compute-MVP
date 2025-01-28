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


import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye } from 'lucide-react';

interface ValidationResult {
  success: boolean;
  error: string | null;
}

interface SchemaPreviewProps {
  schemaFile: File | null;
}

interface SchemaColumn {
  name: string;
  type: string;
  required: boolean;
  items?: { type: string };
}

/**
 * Validates the JSON schema and data file.
 */
export async function validateJsonSchema(
  schemaFile: File,
  dataFile: File
): Promise<ValidationResult> {
  try {
    const schemaText = await schemaFile.text();
    const dataText = await dataFile.text();
    const schema = JSON.parse(schemaText);
    const data = JSON.parse(dataText);

    // Check if schema has required fields
    if (!schema.type || !schema.properties) {
      return {
        success: false,
        error: 'Schema must include "type" and "properties".',
      };
    }

    return validateDataAgainstSchema(data, schema);
  } catch (error) {
    return {
      success: false,
      error: 'Failed to validate schema or data. Ensure both are valid JSON files.',
    };
  }
}

/**
 * Validates data against a schema.
 */
function validateDataAgainstSchema(data: any, schema: any): ValidationResult {
  if (schema.type === 'object') {
    // Validate object properties
    if (!schema.properties || typeof schema.properties !== 'object') {
      return {
        success: false,
        error: 'Schema properties are invalid or missing.',
      };
    }

    if (schema.required) {
      const missingFields = schema.required.filter((field: string) => !(field in data));
      if (missingFields.length > 0) {
        return {
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
        };
      }
    }
  }

  return { success: true, error: null };
}

/**
 * Renders a preview of the JSON schema.
 */
export const SchemaPreview = ({ schemaFile }: SchemaPreviewProps) => {
  const [open, setOpen] = useState(false);
  const [schema, setSchema] = useState<any>(null);
  const [columns, setColumns] = useState<SchemaColumn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadSchema = async () => {
    if (!schemaFile) return;

    try {
      const text = await schemaFile.text();
      const parsedSchema = JSON.parse(text);
      setSchema(parsedSchema);

      // Extract schema columns
      const schemaColumns: SchemaColumn[] = Object.entries(parsedSchema.properties || {}).map(
        ([name, prop]: [string, any]) => ({
          name,
          type: prop.type,
          required: (parsedSchema.required || []).includes(name),
          items: prop.items,
        })
      );
      setColumns(schemaColumns);
    } catch (err) {
      setError('Failed to parse schema file.');
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          loadSchema();
        }}
        disabled={!schemaFile}
        className="hover:bg-gray-100 hover:text-gray-900 text-gray-600"
      >
        <Eye className="mr-2 h-4 w-4" />
        Preview Schema
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Schema Preview</DialogTitle>
          </DialogHeader>

          {error ? (
            <div className="text-red-500 p-4">{error}</div>
          ) : (
            <Tabs defaultValue="table" className="flex-1 flex flex-col">
              <TabsList>
                <TabsTrigger value="table">Table</TabsTrigger>
                <TabsTrigger value="tree">Tree</TabsTrigger>
              </TabsList>

              <TabsContent value="table">
                <ScrollArea>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Items</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {columns.map((col) => (
                        <TableRow key={col.name}>
                          <TableCell>{col.name}</TableCell>
                          <TableCell>{col.type}</TableCell>
                          <TableCell>{col.required ? 'Yes' : 'No'}</TableCell>
                          <TableCell>{col.items?.type || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="tree">
                <ScrollArea>
                  <pre className="p-4 bg-gray-50">{JSON.stringify(schema, null, 2)}</pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};