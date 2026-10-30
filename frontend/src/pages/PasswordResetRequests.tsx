import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Key, Clock, CheckCircle2, XCircle, AlertCircle, Copy, RotateCcw, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api';
import axios from 'axios';

interface PasswordResetRequest {
  id: number;
  user_id: number;
  email: string;
  full_name: string;
  role: string;
  requested_at: string;
  status: 'PENDING' | 'COMPLETED' | 'DENIED';
  resolved_at?: string;
  resolved_by?: number;
  resolved_by_name?: string;
}

const PasswordResetRequests = () => {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [deniedRequests, setDeniedRequests] = useState<PasswordResetRequest[]>([]);
  const [completedRequests, setCompletedRequests] = useState<PasswordResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PasswordResetRequest | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [approving, setApproving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/user-management/password-reset-requests/all`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const allRequests = response.data.requests || [];
      setRequests(allRequests.filter((r: PasswordResetRequest) => r.status === 'PENDING'));
      setDeniedRequests(allRequests.filter((r: PasswordResetRequest) => r.status === 'DENIED'));
      setCompletedRequests(allRequests.filter((r: PasswordResetRequest) => r.status === 'COMPLETED'));
    } catch (error) {
      console.error('Error fetching requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load password reset requests',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const generateRandomPassword = () => {
    const length = 12;
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const randomValues = new Uint32Array(length);
    window.crypto.getRandomValues(randomValues);
    const password = Array.from(randomValues, value => charset[value % charset.length]).join('');
    setTemporaryPassword(password);
  };

  const handleApprove = async () => {
    if (!selectedRequest || !temporaryPassword) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a temporary password',
        variant: 'destructive',
      });
      return;
    }

    try {
      setApproving(true);
      const response = await axios.post(
        `${API_BASE_URL}/user-management/users/${selectedRequest.user_id}/reset-password`,
        { temporaryPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setGeneratedPassword(response.data.temporary_password);
      const resolvedAt = new Date().toISOString();
      const completedForUser = requests
        .filter(request => request.user_id === selectedRequest.user_id)
        .map(request => ({ ...request, status: 'COMPLETED' as const, resolved_at: resolvedAt, resolved_by_name: user?.full_name }));
      setRequests(current => current.filter(request => request.user_id !== selectedRequest.user_id));
      setCompletedRequests(current => [...completedForUser, ...current.filter(request => request.user_id !== selectedRequest.user_id)]);
      
      toast({
        title: 'Success',
        description: `Temporary password set for ${selectedRequest.full_name}`,
      });

      // Keep the dialog open to show the generated password.
    } catch (error) {
      console.error('Error approving request:', error);
      const errorMessage = axios.isAxiosError(error) && error.response?.data?.error 
        ? error.response.data.error 
        : 'Failed to reset password';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setApproving(false);
    }
  };

  const handleDeny = async (requestId: number) => {
    try {
      setBusyAction(`deny-${requestId}`);
      await axios.delete(
        `${API_BASE_URL}/user-management/password-reset-requests/${requestId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Request Denied',
        description: 'Password reset request has been denied. User can submit a new request if needed.',
      });

      const deniedRequest = requests.find(request => request.id === requestId);
      setRequests(current => current.filter(request => request.id !== requestId));
      if (deniedRequest) setDeniedRequests(current => [{ ...deniedRequest, status: 'DENIED', resolved_at: new Date().toISOString(), resolved_by_name: user?.full_name }, ...current.filter(request => request.id !== requestId)]);
    } catch (error) {
      console.error('Error denying request:', error);
      toast({
        title: 'Error',
        description: 'Failed to deny request',
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleReapprove = async (request: PasswordResetRequest) => {
    try {
      setBusyAction(`reactivate-${request.id}`);
      // Set status back to PENDING
      await axios.patch(
        `${API_BASE_URL}/user-management/password-reset-requests/${request.id}/reactivate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Request Reactivated',
        description: `Request from ${request.full_name} moved back to pending`,
      });

      setDeniedRequests(current => current.filter(item => item.id !== request.id));
      setRequests(current => [{ ...request, status: 'PENDING' }, ...current.filter(item => item.id !== request.id)]);
    } catch (error) {
      console.error('Error reactivating request:', error);
      toast({
        title: 'Error',
        description: 'Failed to reactivate request',
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: 'Temporary password copied to clipboard',
    });
  };

  const closeDialog = () => {
    setShowApproveDialog(false);
    setSelectedRequest(null);
    setTemporaryPassword('');
    setGeneratedPassword('');
  };

  const openApproveDialog = (request: PasswordResetRequest) => {
    setSelectedRequest(request);
    setShowApproveDialog(true);
    generateRandomPassword(); // Auto-generate a password
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Key className="h-8 w-8 text-orange-600" />
            Password Reset Requests
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage user password reset requests
          </p>
        </div>

        <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
            <strong>How it works:</strong> Approve requests to set temporary passwords. Deny if suspicious. 
            Denied requests can be reactivated from the "Denied" tab if needed. Users can always submit new requests.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="pending" className="relative flex-wrap gap-1">
              <span className="hidden sm:inline">Pending</span>
              <span className="sm:hidden">Pending</span>
              {requests.length > 0 && (
                <Badge variant="destructive" className="ml-2 animate-pulse">
                  {requests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="denied">
              Denied
              {deniedRequests.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {deniedRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          {/* Pending Requests Tab */}
          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle>Pending Requests</CardTitle>
                <CardDescription>
                  Review and approve password reset requests from users
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : requests.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-2" />
                    <p className="text-gray-500">No pending password reset requests</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium break-words">{request.full_name}</TableCell>
                          <TableCell className="break-all">{request.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{request.role}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Clock className="h-4 w-4" />
                              {new Date(request.requested_at).toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => openApproveDialog(request)}
                                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                                <CheckCircle2 className="h-4 w-4 mr-1 flex-shrink-0" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeny(request.id)}
                                disabled={busyAction === `deny-${request.id}`}
                                className="w-full sm:w-auto"
                              >
                                {busyAction === `deny-${request.id}` ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1 flex-shrink-0" />}
                                {busyAction === `deny-${request.id}` ? 'Denying…' : 'Deny'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Denied Requests Tab */}
          <TabsContent value="denied">
            <Card>
              <CardHeader>
                <CardTitle>Denied Requests</CardTitle>
                <CardDescription>
                  Requests that were denied. Users can submit new requests or you can reactivate these.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {deniedRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No denied requests</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Denied</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deniedRequests.map((request) => (
                        <TableRow key={request.id} className="bg-red-50 dark:bg-red-950/10">
                          <TableCell className="font-medium break-words">{request.full_name}</TableCell>
                          <TableCell className="break-all">{request.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{request.role}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Clock className="h-4 w-4" />
                              {new Date(request.requested_at).toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-red-600 whitespace-nowrap">
                              <XCircle className="h-4 w-4 flex-shrink-0" />
                              {request.resolved_at ? new Date(request.resolved_at).toLocaleString() : 'N/A'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReapprove(request)}
                              disabled={busyAction === `reactivate-${request.id}`}
                              className="border-orange-600 text-orange-600 hover:bg-orange-50 w-full sm:w-auto"
                            >
                              {busyAction === `reactivate-${request.id}` ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1 flex-shrink-0" />}
                              {busyAction === `reactivate-${request.id}` ? 'Reactivating…' : 'Reactivate'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Completed Requests Tab */}
          <TabsContent value="completed">
            <Card>
              <CardHeader>
                <CardTitle>Completed Requests</CardTitle>
                <CardDescription>
                  Successfully approved password reset requests
                </CardDescription>
              </CardHeader>
              <CardContent>
                {completedRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No completed requests</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Approved</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedRequests.map((request) => (
                        <TableRow key={request.id} className="bg-green-50 dark:bg-green-950/10">
                          <TableCell className="font-medium break-words">{request.full_name}</TableCell>
                          <TableCell className="break-all">{request.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{request.role}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Clock className="h-4 w-4" />
                              {new Date(request.requested_at).toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-green-600 whitespace-nowrap">
                              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                              {request.resolved_at ? new Date(request.resolved_at).toLocaleString() : 'N/A'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="default" className="bg-green-600">
                              Completed
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Approve Dialog */}
        <Dialog open={showApproveDialog} onOpenChange={closeDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Set Temporary Password</DialogTitle>
              <DialogDescription>
                Set a temporary password for <strong>{selectedRequest?.full_name}</strong>
              </DialogDescription>
            </DialogHeader>

            {generatedPassword ? (
              <div className="space-y-4">
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Temporary password has been set successfully!
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label>Temporary Password (Share this with the user)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={generatedPassword}
                      readOnly
                      className="font-mono text-lg"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copyToClipboard(generatedPassword)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-gray-500">
                    User must change this password on first login
                  </p>
                </div>

                <DialogFooter>
                  <Button onClick={closeDialog}>Done</Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The user will be required to change this password immediately upon login
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="temp-password">Temporary Password</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="temp-password"
                      type="text"
                      value={temporaryPassword}
                      onChange={(e) => setTemporaryPassword(e.target.value)}
                      placeholder="Enter temporary password"
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generateRandomPassword}
                    >
                      Generate
                    </Button>
                  </div>
                  <p className="text-sm text-gray-500">
                    Minimum 6 characters. Click "Generate" for a random secure password.
                  </p>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={closeDialog} disabled={approving}>
                    Cancel
                  </Button>
                  <Button onClick={handleApprove} disabled={approving || !temporaryPassword}>
                    {approving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {approving ? 'Setting Password…' : 'Set Password & Approve'}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default PasswordResetRequests;
