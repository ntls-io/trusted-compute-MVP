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

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import FilePicker from '@/components/FilePicker';
import { SchemaPreview, validateJsonSchema } from '@/components/schemaUtils';
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

  // Reset state when component becomes inactive
  useEffect(() => {
    if (!isActive) {
      setSchemaFile(null)
      setDataFile(null)
      setValidation({ success: false, error: null })
      setIsValidating(false)
    }
  }, [isActive])

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
            {isActive && schemaFile && (
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
    { 
      id: '1', 
      name: 'Append Data Pool', 
      description: 'Permits adding new data entries to existing pools while maintaining schema requirements',
      github: 'https://github.com/ntls-io/trusted-compute-MVP/blob/main/sgx-mvp/json-append/src/lib.rs',
      hash: null
    },
    { 
      id: '2', 
      name: 'Execute Median WASM', 
      description: 'Enables running Rust WebAssembly-based median calculations on data pools',
      github: 'https://github.com/ntls-io/WASM-Binaries-MVP/blob/master/bin/get_median_wasm.wasm',
      hash: '728445d425153350b3e353cc96d29c16d5d81978ea3d7bad21f3d2b2dd76d813'
    },
    { 
      id: '3', 
      name: 'Execute Median Python', 
      description: 'Allows execution of Python-based median computations on data pools',
      github: 'https://github.com/ntls-io/Python-Scripts-MVP/blob/main/calculate_median.py',
      hash: 'bcda34f2af83a2dac745a5d86f18f4c4cd6cb4e61c76e0dec005a5fc9bc124f5'
    }
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Assign Digital Rights</h2>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/6">Name</TableHead>
              <TableHead className="w-2/6">Description</TableHead>
              <TableHead className="w-1/6">GitHub</TableHead>
              <TableHead className="w-1/6">Expected SHA256 Hash</TableHead>
              <TableHead className="w-24">Select</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dummyRights.map((right) => (
              <TableRow key={right.id}>
                <TableCell className="font-medium">{right.name}</TableCell>
                <TableCell>{right.description}</TableCell>
                <TableCell>
                  {right.github ? (
                    <a 
                      href={right.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      View Source
                    </a>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell>
                  {right.hash ? (
                    <div className="font-mono text-sm bg-gray-100 p-2 rounded-md overflow-x-auto whitespace-nowrap">
                      {right.hash}
                    </div>
                  ) : (
                    "-"
                  )}
                </TableCell>
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

export default function Pools() {
  return (
    <div className="space-y-6 container mx-auto px-4 max-w-7xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Create Pool</h1>
      
      <div className="w-full">
        <Card className="p-6">
          <CreatePool />
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">Existing Pools</h2>
        <PoolsTable />
      </div>
    </div>
  )
}