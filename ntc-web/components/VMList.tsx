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

// components/VMList.tsx
"use client"

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Loader2, ChevronRight, ExternalLink } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface VM {
    name: string;
    status: string;
    size: string;
    location: string;
    public_ip: string;
    os_type: string;
}

interface VMDetails extends VM {
    id: string;
    security_profile: {
        security_type: string | null;
        secure_boot: boolean | null;
        vtpm: boolean | null;
    };
    tags: Record<string, string>;
}

interface VMListResponse {
    vms: VM[];
}

export function VMList() {
    const [vms, setVms] = useState<VM[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedVM, setSelectedVM] = useState<VMDetails | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);

    useEffect(() => {
        const fetchVMs = async () => {
            try {
                const response = await fetch(`${API_URL}/vms`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data: VMListResponse = await response.json();
                setVms(data.vms.filter(vm => vm.name !== "ntls-dev-2024"));
                setError(null);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to fetch VMs');
            } finally {
                setLoading(false);
            }
        };

        fetchVMs();
    }, []);

    const fetchVMDetails = async (vmName: string) => {
        setDetailsLoading(true);
        try {
            const response = await fetch(`${API_URL}/vms/${vmName}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const details = await response.json();
            setSelectedVM(details);
        } catch (e) {
            console.error('Error fetching VM details:', e);
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleViewDetails = (vm: VM) => {
        fetchVMDetails(vm.name);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }

    if (vms.length === 0) {
        return (
            <Alert>
                <AlertDescription>No VMs found.</AlertDescription>
            </Alert>
        );
    }

    return (
        <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {vms.map((vm) => (
                    <Card key={vm.name} className="relative group">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>{vm.name}</span>
                                <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => handleViewDetails(vm)}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </CardTitle>
                            <CardDescription>{vm.location}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="font-medium">Status:</span>
                                    <span className={vm.status === 'running' ? 'text-green-600' : 'text-yellow-600'}>
                                        {vm.status}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-medium">Size:</span>
                                    <span>{vm.size}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-medium">IP:</span>
                                    <span>{vm.public_ip || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-medium">OS:</span>
                                    <span>{vm.os_type}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Dialog open={selectedVM !== null} onOpenChange={(open) => !open && setSelectedVM(null)}>
                <DialogContent className="max-w-2xl">
                    {detailsLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : selectedVM && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center justify-between">
                                    <span>{selectedVM.name}</span>
                                    {selectedVM.public_ip && (
                                        <Button variant="outline" size="sm" asChild>
                                            <a 
                                                href={`https://${selectedVM.public_ip}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                                Open
                                            </a>
                                        </Button>
                                    )}
                                </DialogTitle>
                            </DialogHeader>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <h3 className="font-semibold">Basic Information</h3>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <span className="font-medium">Status:</span>
                                        <span className={selectedVM.status === 'running' ? 'text-green-600' : 'text-yellow-600'}>
                                            {selectedVM.status}
                                        </span>
                                        <span className="font-medium">Location:</span>
                                        <span>{selectedVM.location}</span>
                                        <span className="font-medium">Size:</span>
                                        <span>{selectedVM.size}</span>
                                        <span className="font-medium">OS Type:</span>
                                        <span>{selectedVM.os_type}</span>
                                        <span className="font-medium">Public IP:</span>
                                        <span>{selectedVM.public_ip || 'N/A'}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-semibold">Security Profile</h3>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <span className="font-medium">Security Type:</span>
                                        <span>{selectedVM.security_profile.security_type || 'N/A'}</span>
                                        <span className="font-medium">Secure Boot:</span>
                                        <span>{selectedVM.security_profile.secure_boot ? 'Enabled' : 'Disabled'}</span>
                                        <span className="font-medium">vTPM:</span>
                                        <span>{selectedVM.security_profile.vtpm ? 'Enabled' : 'Disabled'}</span>
                                    </div>
                                </div>
                            </div>

                            {Object.keys(selectedVM.tags).length > 0 && (
                                <div className="mt-4">
                                    <h3 className="font-semibold mb-2">Tags</h3>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        {Object.entries(selectedVM.tags).map(([key, value]) => (
                                            <div key={key} className="col-span-2 flex justify-between">
                                                <span className="font-medium">{key}:</span>
                                                <span>{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}