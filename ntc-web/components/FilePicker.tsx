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

'use client'

import { useState, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Upload, Trash2 } from 'lucide-react'

interface FilePickerProps {
  label: string;
  accept?: string;
  onChange: (file: File | null) => void;
}

export function FilePicker({ label, accept, onChange }: FilePickerProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
    onChange(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    setSelectedFile(file)
    onChange(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click event
    setSelectedFile(null)
    onChange(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Card
        className="border-dashed cursor-pointer relative"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {selectedFile && (
          <div 
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-red-100 hover:bg-red-200 rounded-full cursor-pointer transition-colors"
            onClick={handleClear}
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </div>
        )}
        <div className="p-4 text-center">
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            accept={accept}
            onChange={handleFileChange}
          />
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-gray-400" />
            {selectedFile ? (
              <div className="text-sm text-gray-600 pr-8">
                Selected: {selectedFile.name}
              </div>
            ) : (
              <>
                <div className="text-sm text-gray-600">
                  Drop your file here, or click to select
                </div>
                <Button variant="outline" size="sm">
                  Choose File
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
};

export default FilePicker;