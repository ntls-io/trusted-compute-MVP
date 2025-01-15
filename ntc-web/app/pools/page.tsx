'use client'

import { useState } from 'react'
import { FilePicker } from './FilePicker'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface StepProps {
  isActive: boolean;
  onNext: () => void;
  onPrev?: () => void;
}

// Step 1: File Selection Component
function FileSelectionStep({ isActive, onNext }: StepProps) {
  const [schemaFile, setSchemaFile] = useState<File | null>(null)
  const [dataFile, setDataFile] = useState<File | null>(null)
  const [validation, setValidation] = useState<{ success: boolean; error: string | null }>({
    success: false,
    error: null
  })

  const validateFiles = async () => {
    if (!schemaFile || !dataFile) {
      setValidation({ success: false, error: 'Please select both schema and data files' })
      return
    }

    try {
      // Read and validate schema
      const schemaText = await schemaFile.text()
      const schema = JSON.parse(schemaText)

      // Read and validate data against schema
      const dataText = await dataFile.text()
      const data = JSON.parse(dataText)

      // TODO: Add actual schema validation
      setValidation({ success: true, error: null })
      onNext()
    } catch (error) {
      setValidation({ success: false, error: 'Invalid JSON format or schema mismatch' })
    }
  }

  if (!isActive) return null

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Select Files</h2>
        
        <div className="space-y-4">
          <FilePicker
            label="Select Schema File"
            accept=".json"
            onChange={(file) => setSchemaFile(file)}
          />
          
          <FilePicker
            label="Select Data File"
            accept=".json"
            onChange={(file) => setDataFile(file)}
          />
        </div>

        {validation.error && (
          <Alert variant="destructive">
            <AlertDescription>{validation.error}</AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={validateFiles}
          disabled={!schemaFile || !dataFile}
          className="w-full"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

// Step 2: Digital Rights Assignment
function DigitalRightsStep({ isActive, onNext, onPrev }: StepProps) {
  const [selectedRights, setSelectedRights] = useState<string[]>([])

  if (!isActive) return null

  const dummyRights = [
    { id: '1', name: 'DRT Name', description: 'Lorem Ipsum' }
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Assign Digital Rights</h2>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-24">Select</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dummyRights.map((right) => (
              <TableRow key={right.id}>
                <TableCell>{right.name}</TableCell>
                <TableCell>{right.description}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={selectedRights.includes(right.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedRights([...selectedRights, right.id])
                      } else {
                        setSelectedRights(selectedRights.filter(id => id !== right.id))
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev}>Previous</Button>
        <Button onClick={onNext}>Next</Button>
      </div>
    </div>
  )
}

// Step 3: Pool Description
function DescriptionStep({ isActive, onNext, onPrev }: StepProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  if (!isActive) return null

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Add Description</h2>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Pool Name</label>
          <Input
            placeholder="Enter name (Max 50 Characters)"
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Pool Description</label>
          <Textarea
            placeholder="Enter description (Max 200 Characters)"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev}>Previous</Button>
        <Button onClick={onNext}>Create Pool</Button>
      </div>
    </div>
  )
}

export default function Pools() {
  const [currentStep, setCurrentStep] = useState(1)

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold text-gray-900">Create Pool</h1>
      
      <Card className="p-6">
        <div className="mb-8">
          <div className="flex justify-between">
            {[1, 2, 3].map((step) => (
              <div 
                key={step}
                className={`flex items-center ${
                  step < 3 ? 'flex-1' : ''
                }`}
              >
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 
                    ${currentStep >= step 
                      ? 'bg-gray-800 text-white border-gray-800' 
                      : 'border-gray-300 text-gray-400'
                    }`}
                >
                  {step}
                </div>
                {step < 3 && (
                  <div 
                    className={`flex-1 h-1 mx-4 ${
                      currentStep > step ? 'bg-gray-800' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <FileSelectionStep 
          isActive={currentStep === 1}
          onNext={() => setCurrentStep(2)}
        />
        
        <DigitalRightsStep 
          isActive={currentStep === 2}
          onNext={() => setCurrentStep(3)}
          onPrev={() => setCurrentStep(1)}
        />
        
        <DescriptionStep 
          isActive={currentStep === 3}
          onNext={() => {
            // Handle pool creation
            alert('Pool created successfully!')
            setCurrentStep(1)
          }}
          onPrev={() => setCurrentStep(2)}
        />
      </Card>
    </div>
  )
}