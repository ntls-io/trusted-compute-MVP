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

// ntc-web/app/drt-code/page.tsx

'use client'

import React, { useEffect, useState, useMemo } from 'react'
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
import { Loader2, Pencil, Trash, Copy, Check, Info } from 'lucide-react'

// ── helpers / types ──────────────────────────────────
interface Drt {
  id: string
  name: string
  description: string
  githubUrl?: string | null
  hash?: string | null
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

// ── validation helpers ───────────────────────────────
const SHA256_REGEX = /^[A-Fa-f0-9]{64}$/

function normaliseGithubUrl(raw: string): string | null {
  if (!raw) return ''
  const trimmed = raw.trim()

  // Accept either https://github.com/… or github.com/…
  let candidate = trimmed
  if (candidate.startsWith('github.com/')) {
    candidate = `https://${candidate}`
  }

  if (!candidate.startsWith('https://github.com/')) return null
  return candidate
}

function isValidSha256(hex: string): boolean {
  return SHA256_REGEX.test(hex.trim())
}

/* ────────────────────────────────────────────────────
   Small utility component to show + copy long hashes
────────────────────────────────────────────────────── */
function HashDisplay({ hash }: { hash: string | null | undefined }) {
  const [copied, setCopied] = useState(false)
  if (!hash) return <span>—</span>

  const handleCopy = async () => {
    await navigator.clipboard.writeText(hash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2_000)
  }

  const truncated = `${hash.slice(0, 4)}....${hash.slice(-4)}`

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="font-mono text-sm bg-gray-100 p-2 rounded-md overflow-x-auto whitespace-nowrap
                       flex items-center justify-between group cursor-pointer"
            onClick={handleCopy}
          >
            <span>{truncated}</span>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 h-6 w-6 p-0"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
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

/* ────────────────────────────────────────────────────
                       PAGE
────────────────────────────────────────────────────── */
export default function DrtCodePage() {
  const { isSignedIn, user } = useUser()

  /* ------- local + table state ------- */
  const [allDrts, setAllDrts] = useState<Drt[]>([])
  const [loading, setLoading] = useState(true)

  // --- search state for community table ---
  const [otherSearch, setOtherSearch] = useState('')

  // --- memoised user id to avoid re-renders if Clerk object changes ---
  const currentUserId = user?.id ?? ''

  const baselineDrts = useMemo(
    () =>
      allDrts.filter(
        (d) => !d.editable && !d.ownerId && d.isActive && d.id !== 'OWNERSHIP_TOKEN',
      ),
    [allDrts],
  )

  const customDrts = useMemo(() => allDrts.filter((d) => d.editable), [allDrts])

  const otherDrts = useMemo(
    () =>
      allDrts.filter(
        (d) => !d.editable && d.ownerId && d.ownerId !== currentUserId && d.id !== 'OWNERSHIP_TOKEN',
      ),
    [allDrts, currentUserId],
  )

  const filteredOtherDrts = useMemo(() => {
    if (!otherSearch.trim()) return otherDrts
    const q = otherSearch.toLowerCase()
    return otherDrts.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q),
    )
  }, [otherDrts, otherSearch])

  /* ------- dialog / form state ------- */
  const emptyForm: FormState = {
    operation: '',
    language: 'PYTHON',
    description: '',
    githubUrl: '',
    hash: '',
  }
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  /* ------- validation/errors ------- */
  const [fieldErrors, setFieldErrors] = useState<{ githubUrl?: string; hash?: string }>({})

  /* ------- delete-confirm state ------- */
  const [deleteId, setDeleteId] = useState<string | null>(null)

  /* ------- NEW: global error modal state ------- */
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  /* ------- fetch helpers ------- */
  const fetchDrts = async () => {
    setLoading(true)
    const res = await fetch('/api/drt-code')
    const data: Drt[] = await res.json()
    setAllDrts(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchDrts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ───── handlers ───── */
  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setFieldErrors({})
    setDialogOpen(true)
  }

  const openEdit = (d: Drt) => {
    setEditingId(d.id)
    setForm({
      operation: d.name.replace(/ (Python|WASM)$/i, ''),
      language: d.name.toUpperCase().endsWith('PYTHON') ? 'PYTHON' : 'WASM',
      description: d.description,
      githubUrl: d.githubUrl || '',
      hash: d.hash || '',
    })
    setFieldErrors({})
    setDialogOpen(true)
  }

  const handleSave = async () => {
    // ── client-side validation ───────────
    const errors: { githubUrl?: string; hash?: string } = {}

    const normalisedUrl = normaliseGithubUrl(form.githubUrl)
    if (normalisedUrl === null) {
      errors.githubUrl = 'URL must start with https://github.com/'
    }

    if (!isValidSha256(form.hash)) {
      errors.hash = 'Hash must be 64 hexadecimal characters (valid SHA-256)'
    }

    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) return // abort save – user must fix

    setSaving(true)

    try {
      const body = editingId
        ? {
            description: form.description,
            githubUrl: normalisedUrl!,
            hash: form.hash.trim(),
            isActive: true,
          }
        : {
            ...form,
            githubUrl: normalisedUrl!,
            hash: form.hash.trim(),
          }

      const res = editingId
        ? await fetch(`/api/drt-code/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/drt-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

      /* —— duplicate-name error —— */
      if (res.status === 409) {
        const { error } = await res.json()
        setErrorMsg(error ?? 'A DRT with that name already exists.')
        setSaving(false)
        return
      }

      /* —— any other server error —— */
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        setErrorMsg(error ?? `Server responded with ${res.status}.`)
        setSaving(false)
        return
      }

      /* —— success —— */
      setSaving(false)
      setDialogOpen(false)
      fetchDrts()
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Network error – could not reach the server.')
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    await fetch(`/api/drt-code/${deleteId}`, { method: 'DELETE' })
    setDeleteId(null)
    fetchDrts()
  }

  /* ───── UI ───── */
  if (!isSignedIn)
    return (
      <div className="container mx-auto p-10 text-center text-lg">Please sign in.</div>
    )

  const thClass = 'bg-gray-800 text-white font-medium'

  return (
    <TooltipProvider>
      <div className="container mx-auto max-w-6xl p-6 space-y-10">
        {/* ================= Header ================= */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Digital Right Token&nbsp;– Code Management</h1>
        </div>

        {/* ================= Baseline table ================= */}
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
                          View&nbsp;Source
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <HashDisplay hash={d.hash} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* ================= Custom table ================= */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">My Custom DRTs</h2>
            <Button size="sm" onClick={openNew}>New&nbsp;DRT</Button>
          </div>

          <Card className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={thClass}>Name</TableHead>
                  <TableHead className={thClass}>Description</TableHead>
                  <TableHead className={thClass}>GitHub&nbsp;URL</TableHead>
                  <TableHead className={thClass}>SHA-256&nbsp;Hash</TableHead>
                  <TableHead className={thClass} style={{ width: 120 }}>Actions</TableHead>
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
                    <td colSpan={5} className="p-6 text-center text-gray-500">No custom DRTs yet.</td>
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
                            View&nbsp;Source
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <HashDisplay hash={d.hash} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-center">
                          {/* ---- Edit ---- */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" onClick={() => openEdit(d)}>
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
                                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(d.id)}>
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

        {/* ================= Community table (other users) ================= */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
            <h2 className="text-xl font-semibold">Community DRTs</h2>
            <Input
              value={otherSearch}
              onChange={(e) => setOtherSearch(e.target.value)}
              placeholder="Search DRTs…"
              className="sm:max-w-xs"
            />
          </div>

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
              {loading ? (
                <tbody>
                  <tr>
                    <td colSpan={4} className="p-8 text-center">
                      <Loader2 className="animate-spin" />
                    </td>
                  </tr>
                </tbody>
              ) : filteredOtherDrts.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-gray-500">No community DRTs found.</td>
                  </tr>
                </tbody>
              ) : (
                <TableBody>
                  {filteredOtherDrts.map((d) => (
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
                            View&nbsp;Source
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <HashDisplay hash={d.hash} />
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
              <DialogTitle>{editingId ? 'Edit DRT' : 'Create DRT'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* --- operation + language only on create --- */}
              {!editingId && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Operation</label>
                    <Input
                      value={form.operation}
                      onChange={(e) => setForm({ ...form, operation: e.target.value })}
                      placeholder="Execute Mean"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Language</label>
                    <select
                      className="w-full border rounded-md p-2"
                      value={form.language}
                      onChange={(e) =>
                        setForm({ ...form, language: e.target.value as 'PYTHON' | 'WASM' })
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
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              {/* GitHub URL */}
              <div className="space-y-2">
                <label className="text-sm font-medium">GitHub URL</label>
                <Input
                  className={fieldErrors.githubUrl ? 'border-red-500' : ''}
                  value={form.githubUrl}
                  onChange={(e) => setForm({ ...form, githubUrl: e.target.value })}
                  placeholder="https://github.com/org/repo/path/to/file"
                />
                {fieldErrors.githubUrl && (
                  <p className="text-sm text-red-600">{fieldErrors.githubUrl}</p>
                )}
              </div>

              {/* SHA-256 Hash */}
              <div className="space-y-2">
                <label className="text-sm font-medium">SHA-256 Hash</label>
                <Input
                  className={fieldErrors.hash ? 'border-red-500' : ''}
                  value={form.hash}
                  onChange={(e) => setForm({ ...form, hash: e.target.value })}
                  placeholder="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                />
                {fieldErrors.hash && <p className="text-sm text-red-600">{fieldErrors.hash}</p>}
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

        {/* ================= Delete Confirm Dialog ================= */}
        <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <Info className="w-5 h-5 text-red-500 inline-block mr-2" /> Delete DRT Code Definition?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-justify mb-4 flex items-start gap-2 p-3 bg-gray-100 rounded-md">
                <span>
                  This will permanently remove the selected custom Digital Right Token definition from your account.
                  Pools that already reference this DRT will remain unaffected, but the token
                  definition itself will be deleted.
                </span>
              </AlertDialogDescription>
              <AlertDialogDescription className="text-justify">
                <strong>This action cannot be undone.</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end gap-2">
              <AlertDialogCancel asChild>
                <Button variant="outline">Cancel</Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {/* ================= GLOBAL ERROR MODAL ================= */}
        <AlertDialog open={errorMsg !== null} onOpenChange={(open) => !open && setErrorMsg(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Error:</AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-line">{errorMsg}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end">
              <AlertDialogAction asChild>
                <Button onClick={() => setErrorMsg(null)}>Dismiss</Button>
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}