import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Eye } from 'lucide-react'

interface SchemaPreviewProps {
  schemaFile: File | null;
}

interface SchemaColumn {
  name: string;
  type: string;
  required: boolean;
  items?: {
    type: string;
  };
}

export function SchemaPreview({ schemaFile }: SchemaPreviewProps) {
  const [open, setOpen] = useState(false);
  const [schema, setSchema] = useState<any>(null);
  const [columns, setColumns] = useState<SchemaColumn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadSchema = async () => {
    if (!schemaFile) return;

    try {
      const text = await schemaFile.text();
      const parsed = JSON.parse(text);
      setSchema(parsed);

      // Extract columns from schema
      const extractedColumns: SchemaColumn[] = Object.entries(parsed.properties || {}).map(
        ([name, prop]: [string, any]) => ({
          name,
          type: prop.type,
          required: (parsed.required || []).includes(name),
          items: prop.items
        })
      );
      setColumns(extractedColumns);
      setError(null);
    } catch (err) {
      setError('Failed to parse schema file');
      setSchema(null);
      setColumns([]);
    }
  };

  const formatSchemaTree = (schema: any) => {
    return JSON.stringify(schema, null, 2);
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
        className="transition-colors hover:bg-gray-100 hover:text-gray-900 text-gray-600"
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
              <TabsList className="bg-gray-100">
                <TabsTrigger 
                  value="table"
                  className="data-[state=active]:bg-gray-800 data-[state=active]:text-white"
                >
                  Table
                </TabsTrigger>
                <TabsTrigger 
                  value="tree"
                  className="data-[state=active]:bg-gray-800 data-[state=active]:text-white"
                >
                  Tree
                </TabsTrigger>
              </TabsList>

              <TabsContent value="table" className="flex-1 mt-0">
                <ScrollArea className="h-[400px] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableHead className="font-semibold">Column Name</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">Required</TableHead>
                        <TableHead className="font-semibold">Item Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {columns.map((column) => (
                        <TableRow key={column.name} className="hover:bg-gray-100">
                          <TableCell className="font-medium">{column.name}</TableCell>
                          <TableCell>{column.type}</TableCell>
                          <TableCell>{column.required ? 'Yes' : 'No'}</TableCell>
                          <TableCell>{column.items?.type || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="tree" className="flex-1 mt-0">
                <ScrollArea className="h-[400px] rounded-md border">
                  <pre className="p-4 text-sm bg-gray-50 font-mono">
                    {schema ? formatSchemaTree(schema) : 'No schema loaded'}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}