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

//components/DeployVM.tsx
"use client"

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Progress } from "@/components/ui/progress"

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const POLLING_INTERVAL = 30000; // 30 seconds to match container polling
const MAX_STARTUP_ATTEMPTS = 6; // 3 minutes max for container startup (6 * 30s)
const MAX_POLLING_ATTEMPTS = 20; // ~10 minutes of polling (20 * 30s)

interface DeploymentResponse {
  request_id: string;
  vm_name: string;
  status: string;
  created_at: string;
}

interface DeploymentStatus {
  request_id: string;
  vm_name: string;
  status: string;
  created_at: string;
  completed_at?: string;
  public_ip?: string;
  details?: {
    resource_group?: string;
    location?: string;
    vm_size?: string;
    setup_script?: string;
  };
  error?: string;
}

export function DeployVM() {
  const [namePrefix, setNamePrefix] = useState('ntls-tee');
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<DeploymentStatus | null>(null);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const [estimatedProgress, setEstimatedProgress] = useState(0);
  const [startupPhase, setStartupPhase] = useState(true);

  const deployVM = async () => {
    setIsDeploying(true);
    setError(null);
    setStartupPhase(true);
    setPollingAttempts(0);
    setEstimatedProgress(0);
    
    try {
      console.log('Starting deployment...');
      const response = await fetch(`${API_URL}/deployments?name_prefix=${namePrefix}`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        console.error('Deployment failed:', response.status, response.statusText);
        throw new Error(`Failed to start deployment (Status ${response.status}). The service might be starting up, please try again in a minute.`);
      }
      
      const data: DeploymentResponse = await response.json();
      console.log('Deployment initiated:', data);
      
      if (!data.request_id) {
        throw new Error('No request ID received from server');
      }

      setDeployment({
        request_id: data.request_id,
        vm_name: data.vm_name,
        status: data.status,
        created_at: data.created_at
      });
      setEstimatedProgress(5);
    } catch (e) {
      console.error('Deployment error:', e);
      setError(e instanceof Error ? e.message : 'Failed to deploy VM');
      setIsDeploying(false);
    }
  };

  useEffect(() => {
    if (!deployment?.request_id || ['completed', 'failed', 'partial_success'].includes(deployment.status)) {
      return;
    }

    console.log('Starting polling for request ID:', deployment.request_id);

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/deployments/${deployment.request_id}`);
        console.log('Poll response:', response.status, 'Attempt:', pollingAttempts + 1);
        
        if (response.status === 404) {
          setPollingAttempts(prev => prev + 1);
          // Handle initial container startup period
          if (startupPhase && pollingAttempts >= MAX_STARTUP_ATTEMPTS) {
            setError('Deployment service is taking longer than expected to start. Please try again.');
            setIsDeploying(false);
            clearInterval(pollInterval);
            return;
          }
          // Set progress for startup phase
          setEstimatedProgress(prev => Math.min(prev + 2, 15));
          return;
        }

        // If we get a response, we're past the startup phase
        setStartupPhase(false);
        
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.statusText}`);
        }
        
        setPollingAttempts(prev => prev + 1);
        const status: DeploymentStatus = await response.json();
        console.log('Deployment status:', status);
        
        setDeployment(status);
        
        // Update progress based on status and time elapsed
        switch(status.status) {
          case 'pending':
            setEstimatedProgress(15);
            break;
          case 'provisioning':
            setEstimatedProgress(20 + Math.min(pollingAttempts * 2, 30));
            break;
          case 'vm_provisioned':
            setEstimatedProgress(60);
            break;
          case 'configuring':
            setEstimatedProgress(70 + Math.min(pollingAttempts, 20));
            break;
          case 'completed':
          case 'failed':
          case 'partial_success':
            setEstimatedProgress(100);
            setIsDeploying(false);
            clearInterval(pollInterval);
            break;
        }

        // Stop polling after maximum attempts
        if (pollingAttempts >= MAX_POLLING_ATTEMPTS) {
          setError('Deployment is taking longer than expected but may still be in progress. Check the VM list for status.');
          setIsDeploying(false);
          clearInterval(pollInterval);
        }
        
      } catch (e) {
        console.error('Polling error:', e);
        setPollingAttempts(prev => prev + 1);
        if (pollingAttempts > MAX_STARTUP_ATTEMPTS) {
          setError('Having trouble checking deployment status. The deployment may still be in progress.');
        }
      }
    }, POLLING_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [deployment, pollingAttempts, startupPhase]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'partial_success':
        return 'text-yellow-600';
      default:
        return 'text-blue-600';
    }
  };

  const getStatusMessage = (status: string) => {
    if (startupPhase) {
      return 'Waiting for deployment service to start... This may take 1-2 minutes due to container scaling.';
    }
    
    switch(status) {
      case 'pending':
        return 'Initializing deployment...';
      case 'provisioning':
        return 'Creating VM infrastructure (this may take 10-15 minutes)...';
      case 'vm_provisioned':
        return 'VM created, preparing configuration...';
      case 'configuring':
        return 'Configuring VM security settings...';
      case 'completed':
        return 'Deployment completed successfully';
      case 'failed':
        return 'Deployment failed';
      case 'partial_success':
        return 'Deployment completed with some issues';
      default:
        return 'Processing...';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Deploy New VM</CardTitle>
          <CardDescription>
            Deploy a new Azure TEE instance with Nautilus Library (typical deployment time: ~3 minutes)
            {startupPhase && isDeploying && (
              <p className="text-sm text-muted-foreground mt-2">
                Note: Initial request may take 1-2 minutes while the service scales up
              </p>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Input
              placeholder="VM Name Prefix"
              value={namePrefix}
              onChange={(e) => setNamePrefix(e.target.value)}
              className="max-w-xs"
            />
            <Button 
              onClick={deployVM} 
              disabled={isDeploying || !namePrefix}
            >
              {isDeploying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deploy VM
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {deployment && (
        <Card>
          <CardHeader>
            <CardTitle>Deployment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Progress value={estimatedProgress} className="w-full" />
                <p className="text-sm text-muted-foreground">
                  {getStatusMessage(deployment.status)}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <span className="font-medium">VM Name:</span>
                <span>{deployment.vm_name}</span>
                
                <span className="font-medium">Status:</span>
                <span className={getStatusColor(deployment.status)}>
                  {deployment.status.charAt(0).toUpperCase() + deployment.status.slice(1)}
                  {['pending', 'provisioning', 'configuring'].includes(deployment.status) && 
                    <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />
                  }
                </span>

                {deployment.public_ip && (
                  <>
                    <span className="font-medium">Public IP:</span>
                    <span>{deployment.public_ip}</span>
                  </>
                )}

                {deployment.details && (
                  <>
                    <span className="font-medium">Resource Group:</span>
                    <span>{deployment.details.resource_group}</span>

                    <span className="font-medium">Location:</span>
                    <span>{deployment.details.location}</span>

                    <span className="font-medium">VM Size:</span>
                    <span>{deployment.details.vm_size}</span>

                    {deployment.details.setup_script && (
                      <>
                        <span className="font-medium">Setup Script:</span>
                        <span>{deployment.details.setup_script}</span>
                      </>
                    )}
                  </>
                )}

                {deployment.error && (
                  <>
                    <span className="font-medium">Error:</span>
                    <span className="text-red-600">{deployment.error}</span>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}