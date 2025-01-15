'use client'

import { useState, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Upload } from 'lucide-react'

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

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Card
        className="border-dashed cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
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
              <div className="text-sm text-gray-600">
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
}