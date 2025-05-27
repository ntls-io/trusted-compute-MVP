// ntc-web/app/drt-code/page.tsx

'use client'

import React, { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'

// ── shadcn ui ─────────────────────────────────────────
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ── icons ────────────────────────────────────────────
import { Loader2, Pencil, Trash, Copy, Check } from 'lucide-react'

// ── helpers / types ──────────────────────────────────
interface Drt {
  id: string
  name: string
  description: string
  githubUrl?: string | null
  hash?: string | null // This is the source of the 'undefined'
  editable: boolean
  isActive: boolean
  ownerId?: string | null
}

interface FormState {
  operation: string
  language: 'PYTHON' | 'WASM'
  description: string
  githubUrl: string
  hash: string
}

// ─────────────────────────────────────────────────────

// New HashDisplay Component
// Change the type of hash to string | null | undefined
function HashDisplay({ hash }: { hash: string | null | undefined }) {
  const [copied, setCopied] = useState(false)

  if (!hash) return <span>—</span>

  const handleCopy = async () => {
    await navigator.clipboard.writeText(hash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const truncatedHash = `${hash.slice(0, 4)}....${hash.slice(-4)}`

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="font-mono text-sm bg-gray-100 p-2 rounded-md overflow-x-auto whitespace-nowrap flex items-center justify-between group cursor-pointer">
            <span>{truncatedHash}</span>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 h-6 w-6 p-0"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md p-2">
          <p className="font-mono text-sm break-all">{hash}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─────────────────────────────────────────────────────
export default function DrtCodePage() {
  const { isSignedIn } = useUser()

  /* ------------------- local state ------------------ */
  const [allDrts, setAllDrts] = useState<Drt[]>([])
  const [loading, setLoading] = useState(true)

  // split into baseline vs custom
  const baselineDrts = allDrts.filter(
    (d) => !d.editable && d.isActive && d.id !== 'OWNERSHIP_TOKEN'
  )
  const customDrts   = allDrts.filter((d) => d.editable)

  /* -------------- form / dialog state --------------- */
  const emptyForm: FormState = {
    operation: '',
    language: 'PYTHON',
    description: '',
    githubUrl: '',
    hash: '',
  }
  const [form, setForm]           = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving]       = useState(false)

  /* -------------- delete-confirm state -------------- */
  const [deleteId, setDeleteId]   = useState<string | null>(null)

  /* ------------------- fetch helper ----------------- */
  const fetchDrts = async () => {
    setLoading(true)
    const res = await fetch('/api/drt-code')
    const data: Drt[] = await res.json()
    setAllDrts(data)
    setLoading(false)
  }

  /* -------------------- effects --------------------- */
  useEffect(() => {
    fetchDrts()
  }, [])

  /* ---------------- handlers ------------------------ */
  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (d: Drt) => {
    setEditingId(d.id)
    setForm({
      operation   : d.name.replace(/ (Python|WASM)$/, ''),
      language    : d.name.endsWith('Python') ? 'PYTHON' : 'WASM',
      description : d.description,
      githubUrl   : d.githubUrl || '',
      hash        : d.hash || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)

    if (editingId) {
      await fetch(`/api/drt-code/${editingId}`, {
        method : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          description : form.description,
          githubUrl   : form.githubUrl,
          hash        : form.hash,
          isActive    : true,
        }),
      })
    } else {
      await fetch('/api/drt-code', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(form),
      })
    }

    setSaving(false)
    setDialogOpen(false)
    fetchDrts()
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    await fetch(`/api/drt-code/${deleteId}`, { method: 'DELETE' })
    setDeleteId(null)
    fetchDrts()
  }

  /* ------------------- render ----------------------- */
  if (!isSignedIn)
    return (
      <div className="container mx-auto p-10 text-center text-lg">
        Please sign in.
      </div>
    )

  const thClass = 'bg-gray-800 text-white font-medium'

  return (
    <TooltipProvider>
      <div className="container mx-auto max-w-6xl p-6 space-y-10">
        {/* ================= Header ================= */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Digital Right Token - Code Management</h1>
        </div>

        {/* ================= Baseline DRTs ================= */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Nautilus Baseline DRTs</h2>
          <Card className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={thClass}>Name</TableHead>
                  <TableHead className={thClass}>Description</TableHead>
                  <TableHead className={thClass}>GitHub&nbsp;URL</TableHead>
                  <TableHead className={thClass}>SHA-256&nbsp;Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {baselineDrts.map((d) => (
                  <TableRow key={d.id} className="bg-gray-50 text-gray-500">
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{d.description}</TableCell>
                    <TableCell>
                      {d.githubUrl ? (
                        <a
                          href={d.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          View Source
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <HashDisplay hash={d.hash} /> {/* Use HashDisplay here */}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* ================= Custom DRTs ================= */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Custom Defined DRTs</h2>
            <Button size="sm" onClick={openNew}>
              New DRT
            </Button>
          </div>

          <Card className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={thClass}>Name</TableHead>
                  <TableHead className={thClass}>Description</TableHead>
                  <TableHead className={thClass}>GitHub&nbsp;URL</TableHead>
                  <TableHead className={thClass}>SHA-256&nbsp;Hash</TableHead>
                  <TableHead className={thClass} style={{ width: 120 }}>
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>

              {loading ? (
                <tbody>
                  <tr>
                    <td colSpan={5} className="p-8 text-center">
                      <Loader2 className="animate-spin" />
                    </td>
                  </tr>
                </tbody>
              ) : customDrts.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-gray-500">
                      No custom DRTs yet.
                    </td>
                  </tr>
                </tbody>
              ) : (
                <TableBody>
                  {customDrts.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.description}</TableCell>
                      <TableCell>
                        {d.githubUrl ? (
                          <a
                            href={d.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-blue-600 hover:text-blue-800"
                          >
                            View Source
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <HashDisplay hash={d.hash} /> {/* Use HashDisplay here */}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-center">
                          {/* ---- Edit ---- */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEdit(d)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit this DRT</TooltipContent>
                          </Tooltip>

                          {/* ---- Delete ---- */}
                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setDeleteId(d.id)}
                                  >
                                    <Trash className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent>Delete this DRT</TooltipContent>
                            </Tooltip>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              )}
            </Table>
          </Card>
        </section>

        {/* ================= Create / Edit Dialog ================= */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingId ? 'Edit DRT' : 'Create DRT'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {!editingId && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Operation</label>
                    <Input
                      value={form.operation}
                      onChange={(e) =>
                        setForm({ ...form, operation: e.target.value })
                      }
                      placeholder="Execute Mean"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Language</label>
                    <select
                      className="w-full border rounded-md p-2"
                      value={form.language}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          language: e.target.value as 'PYTHON' | 'WASM',
                        })
                      }
                    >
                      <option value="PYTHON">Python</option>
                      <option value="WASM">WASM</option>
                    </select>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">GitHub URL</label>
                <Input
                  value={form.githubUrl}
                  onChange={(e) =>
                    setForm({ ...form, githubUrl: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">SHA-256 Hash</label>
                <Input
                  value={form.hash}
                  onChange={(e) =>
                    setForm({ ...form, hash: e.target.value })
                  }
                />
              </div>

              <Button
                className="w-full"
                onClick={handleSave}
                disabled={
                  saving || (!editingId && form.operation.trim().length === 0)
                }
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? 'Save' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ================= Delete Confirm Dialog ================ */}
        <AlertDialog
          open={deleteId !== null}
          onOpenChange={(open) => !open && setDeleteId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete DRT?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the selected Digital Right Token
                from your account. Pools that already reference this DRT will
                remain unaffected, but the token definition itself will be
                deleted. Are you sure?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end gap-2">
              <AlertDialogCancel asChild>
                <Button variant="outline">Cancel</Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button variant="destructive" onClick={confirmDelete}>
                  Delete
                </Button>
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}