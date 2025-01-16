'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
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
import { FilePicker } from './FilePicker'
import { validateJsonSchema } from './schemaValidation'
import { SchemaPreview } from './SchemaPreview'
import PoolsTable from './PoolsTable'

// Common styles
const buttonBaseClass = "bg-gray-900 text-white hover:bg-gray-800"
const buttonOutlineClass = "border-2 border-gray-900 text-gray-900 hover:bg-gray-100"

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
  const [isValidating, setIsValidating] = useState(false)

  const validateFiles = async () => {
    if (!schemaFile || !dataFile) {
      setValidation({ success: false, error: 'Please select both schema and data files' })
      return
    }

    setIsValidating(true)
    try {
      const result = await validateJsonSchema(schemaFile, dataFile)
      setValidation(result)
      
      if (result.success) {
        onNext()
      }
    } catch (error) {
      setValidation({ 
        success: false, 
        error: 'An error occurred during validation' 
      })
    } finally {
      setIsValidating(false)
    }
  }

  if (!isActive) return null

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Select Files</h2>
        
        <div className="space-y-4">
          <div>
            <FilePicker
              label="Select Schema File"
              accept=".json"
              onChange={(file) => {
                setSchemaFile(file)
                setValidation({ success: false, error: null })
              }}
            />
            {schemaFile && (
              <div className="mt-2 flex justify-center">
                <SchemaPreview schemaFile={schemaFile} />
              </div>
            )}
          </div>
          
          <FilePicker
            label="Select Data File"
            accept=".json"
            onChange={(file) => {
              setDataFile(file)
              setValidation({ success: false, error: null })
            }}
          />
        </div>

        {validation.error && (
          <Alert variant="destructive">
            <AlertDescription>{validation.error}</AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={validateFiles}
          disabled={!schemaFile || !dataFile || isValidating}
          className={`w-full ${buttonBaseClass}`}
        >
          {isValidating ? 'Validating...' : 'Next'}
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
    { id: '1', name: 'Create data pool', description: 'Allows creation of new data pools and setting initial parameters for data structure and digital right tokens' },
    { id: '2', name: 'Append data pool', description: 'Permits adding new data entries to existing pools while maintaining schema requirements' },
    { id: '3', name: 'Execute Median WASM', description: 'Enables running Rust WebAssembly-based median calculations on data pools' },
    { id: '4', name: 'Execute Median Python', description: 'Allows execution of Python-based median computations on data pools' }
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
        <Button variant="outline" onClick={onPrev} className={buttonOutlineClass}>
          Previous
        </Button>
        <Button onClick={onNext} className={buttonBaseClass}>
          Next
        </Button>
      </div>
    </div>
  )
}

// Step 3: Pool Description
function DescriptionStep({ isActive, onNext, onPrev }: StepProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [validation, setValidation] = useState<{ error: string | null }>({ error: null })

  const validateAndProceed = () => {
    if (!name.trim()) {
      setValidation({ error: 'Pool name is required' })
      return
    }
    if (!description.trim()) {
      setValidation({ error: 'Pool description is required' })
      return
    }
    onNext()
  }

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
            onChange={(e) => {
              setName(e.target.value)
              setValidation({ error: null })
            }}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Pool Description</label>
          <Textarea
            placeholder="Enter description (Max 200 Characters)"
            maxLength={200}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setValidation({ error: null })
            }}
          />
        </div>

        {validation.error && (
          <Alert variant="destructive">
            <AlertDescription>{validation.error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onPrev} className={buttonOutlineClass}>
          Previous
        </Button>
        <Button onClick={validateAndProceed} className={buttonBaseClass}>
          Create Pool
        </Button>
      </div>
    </div>
  )
}

function CreatePool() {
  const [currentStep, setCurrentStep] = useState(1)

  return (
    <Card className="p-6">
      {/* Progress Steps */}
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
                    ? 'bg-gray-900 text-white border-gray-900' 
                    : 'border-gray-300 text-gray-400'
                  }`}
              >
                {step}
              </div>
              {step < 3 && (
                <div 
                  className={`flex-1 h-1 mx-4 ${
                    currentStep > step ? 'bg-gray-900' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Components */}
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
          alert('Pool created successfully!')
          setCurrentStep(1)
        }}
        onPrev={() => setCurrentStep(2)}
      />
    </Card>
  )
}

function JoinPool() {
  const [dataFile, setDataFile] = useState<File | null>(null)
  const [validation, setValidation] = useState<{
    success: boolean | null;
    error: string | null;
  }>({
    success: null,
    error: null,
  })
  const [isValidating, setIsValidating] = useState(false)

  // Dummy digital rights
  const digitalRights = [
    'Create data pool',
    'Append data pool',
    'Execute Median WASM',
    'Execute Python Median',
  ]

  const handleJoinPool = async () => {
    if (!dataFile) {
      setValidation({ success: false, error: 'Please select a data file' })
      return
    }

    setIsValidating(true)
    try {
      // Here you would validate against the pool's schema
      // For now, we'll simulate validation
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setValidation({
        success: true,
        error: null,
      })
      alert('Successfully joined pool!')
    } catch (error) {
      setValidation({
        success: false,
        error: 'Failed to validate data file against pool schema',
      })
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h4 className="text-xl font-semibold">Pool Name</h4>
          <p className="text-gray-600 mt-1">Pool Description</p>
        </div>

        <div>
          <h5 className="text-lg font-semibold mb-3">Digital Rights</h5>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {digitalRights.map((right, index) => (
              <Card key={index} className="p-3">
                <p className="text-sm">{right}</p>
              </Card>
            ))}
          </div>
        </div>

        <Button variant="outline" className={buttonOutlineClass}>
          View Schema Definition
        </Button>

        <div className="space-y-4">
          <FilePicker
            label="Select Data File"
            accept=".json"
            onChange={(file) => {
              setDataFile(file)
              setValidation({
                success: null,
                error: null,
              })
            }}
          />
          
          {validation.error && (
            <Alert variant="destructive">
              <AlertDescription>{validation.error}</AlertDescription>
            </Alert>
          )}

          <Button 
            onClick={handleJoinPool}
            disabled={!dataFile || isValidating}
            className={`w-full ${buttonBaseClass}`}
          >
            {isValidating ? 'Validating...' : 'Join Pool'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function Pools() {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold text-gray-900">Pools</h1>
      
      <div className="max-w-3xl mx-auto">
        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid w-full grid-cols-2 p-1 bg-white rounded-lg">
            <TabsTrigger 
              value="create" 
              className="rounded-lg data-[state=active]:bg-gray-800 data-[state=active]:text-white data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:bg-gray-100 transition-colors"
            >
              Create Pool
            </TabsTrigger>
            <TabsTrigger 
              value="join"
              className="rounded-lg data-[state=active]:bg-gray-800 data-[state=active]:text-white data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:bg-gray-100 transition-colors"
            >
              Join Pool
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="create">
            <CreatePool />
          </TabsContent>
          
          <TabsContent value="join">
            <JoinPool />
          </TabsContent>
        </Tabs>
      </div>

      {/* Pools Table Section - Full width */}
      <div className="mt-8 px-6">
        <h2 className="text-2xl font-semibold mb-4">Existing Pools</h2>
        <PoolsTable />
      </div>
    </div>
  )
}